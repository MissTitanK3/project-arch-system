import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PrepareError,
  buildPromptContent,
  buildTaskContract,
  checkTaskExecutable,
  findTaskById,
  generateRunId,
  prepareAgentRunFromRecord,
} from "./prepare";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION } from "./output";
import { agentContractPath, agentPromptPath } from "./paths";
import { agentTaskContractSchema } from "../../schemas/agentTaskContract";
import * as taskValidation from "../validation/tasks";
import type { TaskRecord } from "../validation/tasks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.map((root) => fs.remove(root)));
  tempRoots.length = 0;
});

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-agent-prepare-"));
  tempRoots.push(root);
  return root;
}

function makeTaskRecord(overrides: Partial<TaskRecord["frontmatter"]> = {}): TaskRecord {
  const cwd = "/fake/repo";
  const lane = overrides.lane ?? "planned";
  return {
    projectId: "shared",
    phaseId: "phase-agent-command-surface",
    milestoneId: "milestone-1-prepare-and-result-import",
    lane,
    filePath: `${cwd}/roadmap/projects/shared/phases/phase-agent-command-surface/milestones/milestone-1-prepare-and-result-import/tasks/${lane}/001-implement-agent-prepare-runtime-flow.md`,
    frontmatter: {
      schemaVersion: "2.0",
      id: "001",
      slug: "implement-agent-prepare-runtime-flow",
      title: "Implement agent prepare runtime flow",
      lane,
      status: "todo",
      createdAt: "2026-04-01",
      updatedAt: "2026-04-01",
      discoveredFromTask: null,
      tags: ["agent-runtime", "cli", "prepare"],
      codeTargets: [
        "packages/project-arch/src/core/agentRuntime/",
        "packages/project-arch/src/sdk/agent.ts",
      ],
      publicDocs: [
        "feedback/2-agent-command-surface-spec.md",
        "feedback/1-agent-contract-schemas.md",
        "feedback/3-agent-control-plane-rfc.md",
      ],
      decisions: [],
      completionCriteria: [
        "Prepare logic can resolve an executable task into a run-scoped contract.",
        "Prepared artifacts use the agreed run-scoped storage model.",
      ],
      scope:
        "Implement the runtime-side prepare flow that loads task context and produces the contract and prompt artifacts.",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// generateRunId
// ---------------------------------------------------------------------------

describe("generateRunId", () => {
  it("produces a run id matching run-YYYY-MM-DD-HHmmss using the provided date", () => {
    const d = new Date("2026-04-01T14:35:00.000Z");
    const id = generateRunId(d);
    expect(id).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d{6}$/);
    expect(id.startsWith("run-2026-04-01-")).toBe(true);
  });

  it("produces unique ids for different times", () => {
    const a = generateRunId(new Date("2026-04-01T10:00:01.000Z"));
    const b = generateRunId(new Date("2026-04-01T10:00:02.000Z"));
    expect(a).not.toBe(b);
  });
});

describe("findTaskById", () => {
  it("returns the unique task when given a bare 3-digit id", async () => {
    const record = makeTaskRecord();
    vi.spyOn(taskValidation, "collectTaskRecords").mockResolvedValue([record]);

    await expect(findTaskById("001", "/fake/repo")).resolves.toEqual(record);
  });

  it("returns the scoped task match when given phase/milestone/task", async () => {
    const record = makeTaskRecord();
    vi.spyOn(taskValidation, "collectTaskRecords").mockResolvedValue([
      makeTaskRecord({ id: "002", title: "Another task" }),
      record,
    ]);

    await expect(
      findTaskById("phase-agent-command-surface/milestone-1-prepare-and-result-import/001"),
    ).resolves.toEqual(record);
  });

  it("throws a scoped-reference error when a bare id is ambiguous", async () => {
    const left = makeTaskRecord();
    const right: TaskRecord = {
      ...makeTaskRecord(),
      milestoneId: "milestone-2-validate-and-reconcile-commands",
      filePath:
        "/fake/repo/roadmap/projects/shared/phases/phase-agent-command-surface/milestones/milestone-2-validate-and-reconcile-commands/tasks/planned/001-implement-agent-prepare-runtime-flow.md",
      frontmatter: {
        ...makeTaskRecord().frontmatter,
        title: "Implement ambiguous duplicate",
      },
    };
    vi.spyOn(taskValidation, "collectTaskRecords").mockResolvedValue([left, right]);

    await expect(findTaskById("001", "/fake/repo")).rejects.toMatchObject({
      code: "PAA019",
      message: expect.stringContaining(
        "phase-agent-command-surface/milestone-1-prepare-and-result-import/001",
      ),
    });
    await expect(findTaskById("001", "/fake/repo")).rejects.toMatchObject({
      message: expect.stringContaining(
        "phase-agent-command-surface/milestone-2-validate-and-reconcile-commands/001",
      ),
    });
  });
});

// ---------------------------------------------------------------------------
// checkTaskExecutable
// ---------------------------------------------------------------------------

describe("checkTaskExecutable", () => {
  it("accepts a valid planned task with codeTargets", () => {
    expect(() => checkTaskExecutable(makeTaskRecord())).not.toThrow();
  });

  it("rejects a task in a non-planned lane", () => {
    expect(() => checkTaskExecutable(makeTaskRecord({ lane: "backlog" }))).toThrow(PrepareError);
  });

  it("rejects discovered tasks unless explicitly promoted", () => {
    expect(() => checkTaskExecutable(makeTaskRecord({ lane: "discovered" }))).toThrow(PrepareError);
    expect(() =>
      checkTaskExecutable(makeTaskRecord({ lane: "discovered", agent: { executable: true } })),
    ).not.toThrow();
  });

  it("rejects a done task", () => {
    expect(() => checkTaskExecutable(makeTaskRecord({ status: "done" }))).toThrow(PrepareError);
  });

  it("rejects a task with no declared execution surfaces", () => {
    expect(() => checkTaskExecutable(makeTaskRecord({ codeTargets: [], publicDocs: [] }))).toThrow(
      PrepareError,
    );
  });

  it("accepts a doc-only task when publicDocs are declared", () => {
    expect(() =>
      checkTaskExecutable(
        makeTaskRecord({
          codeTargets: [],
          publicDocs: ["architecture/product-framing/project-overview.md"],
        }),
      ),
    ).not.toThrow();
  });

  it("includes a PAA001 code in the thrown error", () => {
    let thrown: PrepareError | undefined;
    try {
      checkTaskExecutable(makeTaskRecord({ lane: "backlog" }));
    } catch (err) {
      thrown = err as PrepareError;
    }
    expect(thrown?.code).toBe("PAA001");
  });

  it("uses PAA013 for approval-required promotion boundaries", () => {
    let thrown: PrepareError | undefined;
    try {
      checkTaskExecutable(makeTaskRecord({ lane: "discovered" }));
    } catch (err) {
      thrown = err as PrepareError;
    }

    expect(thrown?.code).toBe("PAA013");
    expect(thrown?.message).toContain("Approval required");
  });
});

// ---------------------------------------------------------------------------
// buildTaskContract
// ---------------------------------------------------------------------------

describe("buildTaskContract", () => {
  it("produces a valid task contract from a task record", () => {
    const record = makeTaskRecord();
    const runId = "run-2026-04-01-143500";
    const contract = buildTaskContract(record, runId, "/fake/repo");

    expect(agentTaskContractSchema.parse(contract)).toEqual(contract);
    expect(contract.runId).toBe(runId);
    expect(contract.taskId).toBe("001");
    expect(contract.status).toBe("authorized");
    expect(contract.trustLevel).toBe("t1-scoped-edit");
  });

  it("maps codeTargets to scope.allowedPaths", () => {
    const record = makeTaskRecord({
      codeTargets: ["packages/foo/src/", "packages/bar/src/"],
      publicDocs: [],
    });
    const contract = buildTaskContract(record, "run-test-1", "/repo");
    expect(contract.scope.allowedPaths).toEqual(["packages/bar/src/", "packages/foo/src/"]);
  });

  it("maps completionCriteria to successCriteria", () => {
    const record = makeTaskRecord({
      completionCriteria: ["Criterion A", "Criterion B"],
    });
    const contract = buildTaskContract(record, "run-test-2", "/repo");
    expect(contract.successCriteria).toEqual(["Criterion A", "Criterion B"]);
  });

  it("maps publicDocs to architectureContext.relevantDocs", () => {
    const record = makeTaskRecord({
      publicDocs: ["feedback/1-agent-contract-schemas.md"],
    });
    const contract = buildTaskContract(record, "run-test-3", "/repo");
    expect(contract.architectureContext.relevantDocs).toEqual([
      "feedback/1-agent-contract-schemas.md",
    ]);
  });

  it("uses publicDocs in scope.allowedPaths for doc-only tasks", () => {
    const record = makeTaskRecord({
      codeTargets: [],
      publicDocs: ["architecture/product-framing/project-overview.md"],
    });
    const contract = buildTaskContract(record, "run-test-docs", "/repo");
    expect(contract.scope.allowedPaths).toEqual([
      "architecture/product-framing/project-overview.md",
    ]);
  });

  it("uses task scope field as the objective when present", () => {
    const record = makeTaskRecord({ scope: "Do the specific thing." });
    const contract = buildTaskContract(record, "run-test-4", "/repo");
    expect(contract.objective).toBe("Do the specific thing.");
  });

  it("falls back to title as objective when scope is absent", () => {
    const record = makeTaskRecord({ scope: undefined });
    const contract = buildTaskContract(record, "run-test-5", "/repo");
    expect(contract.objective).toBe(record.frontmatter.title);
  });

  it("includes phase, milestone, and project from the task record", () => {
    const record = makeTaskRecord();
    const contract = buildTaskContract(record, "run-test-6", "/repo");
    expect(contract.architectureContext.phaseId).toBe("phase-agent-command-surface");
    expect(contract.architectureContext.milestoneId).toBe("milestone-1-prepare-and-result-import");
    expect(contract.architectureContext.projectId).toBe("shared");
  });
});

// ---------------------------------------------------------------------------
// buildPromptContent
// ---------------------------------------------------------------------------

describe("buildPromptContent", () => {
  it("renders a non-empty markdown prompt containing key sections", () => {
    const record = makeTaskRecord();
    const contract = buildTaskContract(record, "run-2026-04-01-143500", "/fake/repo");
    const prompt = buildPromptContent(contract);

    expect(prompt).toContain("# Agent Task Prompt:");
    expect(prompt).toContain("run-2026-04-01-143500");
    expect(prompt).toContain("## Objective");
    expect(prompt).toContain("## Scope");
    expect(prompt).toContain("## Success Criteria");
    expect(prompt).toContain("## Verification");
    expect(prompt).toContain("## Escalation Rules");
  });

  it("lists allowed and blocked paths", () => {
    const record = makeTaskRecord({
      codeTargets: ["packages/project-arch/src/core/agentRuntime/"],
    });
    const contract = buildTaskContract(record, "run-test", "/repo");
    const prompt = buildPromptContent(contract);

    expect(prompt).toContain("packages/project-arch/src/core/agentRuntime/");
    expect(prompt).toContain(".github/**");
  });

  it("renders external standards when present in the contract", () => {
    const record = makeTaskRecord();
    const contract = buildTaskContract(record, "run-test", "/repo");
    const contractWithStandards = {
      ...contract,
      architectureContext: {
        ...contract.architectureContext,
        externalStandards: [
          "owasp-asvs-4.0.3",
          {
            id: "owasp-cheatsheet-authentication",
            title: "Authentication Cheat Sheet",
            url: "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
          },
        ],
      },
    } as typeof contract;

    const prompt = buildPromptContent(contractWithStandards);
    expect(prompt).toContain("owasp-asvs-4.0.3");
    expect(prompt).toContain("Authentication Cheat Sheet");
  });
});

// ---------------------------------------------------------------------------
// prepareAgentRunFromRecord (file I/O integration)
// ---------------------------------------------------------------------------

describe("prepareAgentRunFromRecord", () => {
  it("writes contract JSON and prompt markdown to run-scoped paths", async () => {
    const cwd = await makeTempRoot();
    const record = makeTaskRecord();
    const runId = "run-2026-04-01-143500";

    const result = await prepareAgentRunFromRecord(record, { cwd, runId });

    expect(result.schemaVersion).toBe("2.0");
    expect(result.runId).toBe(runId);
    expect(result.taskId).toBe("001");
    expect(result.status).toBe("prepared");
    expect(result.contractPath).toBe(`.project-arch/agent-runtime/contracts/${runId}.json`);
    expect(result.promptPath).toBe(`.project-arch/agent-runtime/prompts/${runId}.md`);

    expect(await fs.pathExists(agentContractPath(runId, cwd))).toBe(true);
    expect(await fs.pathExists(agentPromptPath(runId, cwd))).toBe(true);
  });

  it("contract JSON on disk is a valid task contract", async () => {
    const cwd = await makeTempRoot();
    const record = makeTaskRecord();
    const runId = "run-2026-04-01-143501";

    await prepareAgentRunFromRecord(record, { cwd, runId });

    const raw = await fs.readJSON(agentContractPath(runId, cwd));
    expect(() => agentTaskContractSchema.parse(raw)).not.toThrow();
    const contract = agentTaskContractSchema.parse(raw);
    expect(contract.runId).toBe(runId);
    expect(contract.taskId).toBe("001");
  });

  it("prompt markdown contains the run id and task title", async () => {
    const cwd = await makeTempRoot();
    const record = makeTaskRecord();
    const runId = "run-2026-04-01-143502";

    await prepareAgentRunFromRecord(record, { cwd, runId });

    const promptContents = await fs.readFile(agentPromptPath(runId, cwd), "utf8");
    expect(promptContents).toContain(runId);
    expect(promptContents).toContain("Implement agent prepare runtime flow");
  });

  it("keeps different runs for one task distinct by runId", async () => {
    const cwd = await makeTempRoot();
    const record = makeTaskRecord();
    const runA = "run-2026-04-01-100000";
    const runB = "run-2026-04-01-100001";

    await prepareAgentRunFromRecord(record, { cwd, runId: runA });
    await prepareAgentRunFromRecord(record, { cwd, runId: runB });

    expect(await fs.pathExists(agentContractPath(runA, cwd))).toBe(true);
    expect(await fs.pathExists(agentContractPath(runB, cwd))).toBe(true);

    const a = agentTaskContractSchema.parse(await fs.readJSON(agentContractPath(runA, cwd)));
    const b = agentTaskContractSchema.parse(await fs.readJSON(agentContractPath(runB, cwd)));
    expect(a.runId).toBe(runA);
    expect(b.runId).toBe(runB);
    expect(a.taskId).toBe(b.taskId);
  });

  it("in check mode validates without creating any files", async () => {
    const cwd = await makeTempRoot();
    const record = makeTaskRecord();
    const runId = "run-2026-04-01-check";

    const result = await prepareAgentRunFromRecord(record, { cwd, runId, check: true });

    expect(result.schemaVersion).toBe(AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION);
    expect(result.status).toBe("prepared");
    expect(await fs.pathExists(agentContractPath(runId, cwd))).toBe(false);
    expect(await fs.pathExists(agentPromptPath(runId, cwd))).toBe(false);
  });

  it("rejects a non-executable task before touching the filesystem", async () => {
    const cwd = await makeTempRoot();
    const record = makeTaskRecord({ lane: "backlog" });

    await expect(prepareAgentRunFromRecord(record, { cwd, runId: "run-test" })).rejects.toThrow(
      PrepareError,
    );

    expect(await fs.pathExists(agentContractPath("run-test", cwd))).toBe(false);
  });

  it("rejects discovered tasks without promotion and allows promoted discovered tasks", async () => {
    const cwd = await makeTempRoot();

    const discovered = makeTaskRecord({ lane: "discovered" });
    await expect(
      prepareAgentRunFromRecord(discovered, { cwd, runId: "run-discovered-denied" }),
    ).rejects.toThrow(PrepareError);

    const promotedDiscovered = makeTaskRecord({ lane: "discovered", agent: { executable: true } });
    const promotedResult = await prepareAgentRunFromRecord(promotedDiscovered, {
      cwd,
      runId: "run-discovered-promoted",
    });
    expect(promotedResult.status).toBe("prepared");
    expect(promotedResult.runId).toBe("run-discovered-promoted");
  });
});
