import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentPrepare, classifyAgentPrepareFailure, getAgentPrepareExitCode } from "./agent";
import { createTempDir, resultAssertions, type TestProjectContext } from "../test/helpers";
import { AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION } from "../core/agentRuntime/output";
import { agentTaskContractSchema } from "../schemas/agentTaskContract";

describe("sdk/agent", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTempDir();

    const plannedDir = path.join(
      context.tempDir,
      "roadmap",
      "projects",
      "shared",
      "phases",
      "phase-agent-command-surface",
      "milestones",
      "milestone-1-prepare-and-result-import",
      "tasks",
      "planned",
    );
    const discoveredDir = path.join(
      context.tempDir,
      "roadmap",
      "projects",
      "shared",
      "phases",
      "phase-agent-command-surface",
      "milestones",
      "milestone-1-prepare-and-result-import",
      "tasks",
      "discovered",
    );

    await fs.ensureDir(plannedDir);
    await fs.ensureDir(discoveredDir);
    await fs.writeJson(path.join(context.tempDir, "roadmap", "manifest.json"), {
      schemaVersion: "2.0",
      phases: [
        {
          id: "phase-agent-command-surface",
          projectId: "shared",
          createdAt: "2026-04-01",
        },
      ],
      activeProject: "shared",
      activePhase: "phase-agent-command-surface",
      activeMilestone: "milestone-1-prepare-and-result-import",
    });

    const phaseDir = path.join(
      context.tempDir,
      "roadmap",
      "projects",
      "shared",
      "phases",
      "phase-agent-command-surface",
    );
    const milestoneDir = path.join(phaseDir, "milestones", "milestone-1-prepare-and-result-import");
    await fs.ensureDir(milestoneDir);
    await fs.writeFile(path.join(phaseDir, "overview.md"), "# Phase overview\n", "utf8");
    await fs.writeFile(path.join(milestoneDir, "overview.md"), "# Milestone overview\n", "utf8");

    await fs.writeJson(
      path.join(context.tempDir, "roadmap", "projects", "shared", "manifest.json"),
      {
        schemaVersion: "2.0",
        id: "shared",
        title: "Shared",
        type: "shared",
        summary: "Shared project manifest for tests.",
        ownedPaths: ["packages/project-arch/src/**"],
        sharedDependencies: [],
        tags: [],
      },
    );
    await fs.writeFile(
      path.join(plannedDir, "002-implement-pa-agent-prepare-command.md"),
      `---
schemaVersion: "2.0"
id: "002"
slug: implement-pa-agent-prepare-command
title: Implement pa agent prepare command
lane: planned
status: todo
createdAt: "2026-04-01"
updatedAt: "2026-04-01"
discoveredFromTask: null
tags:
  - agent-runtime
  - cli
codeTargets:
  - packages/project-arch/src/cli/commands/agent.ts
  - packages/project-arch/src/sdk/agent.ts
publicDocs:
  - feedback/2-agent-command-surface-spec.md
decisions: []
completionCriteria:
  - pa agent prepare 002 is exposed through the CLI.
scope: Implement the pa agent prepare command.
---

# Implement pa agent prepare command
`,
      "utf8",
    );

    await fs.writeFile(
      path.join(plannedDir, "003-doc-only-project-overview.md"),
      `---
schemaVersion: "2.0"
id: "003"
slug: doc-only-project-overview
title: Define project overview in architecture
lane: planned
status: todo
createdAt: "2026-04-06"
updatedAt: "2026-04-06"
discoveredFromTask: null
tags:
  - setup
  - architecture
codeTargets: []
publicDocs:
  - architecture/product-framing/prompt.md
  - architecture/product-framing/project-overview.md
decisions: []
completionCriteria:
  - project overview docs are updated
scope: Document the project framing.
---

# Define project overview in architecture
`,
      "utf8",
    );

    await fs.writeFile(
      path.join(discoveredDir, "101-discovered-task-needs-promotion.md"),
      `---
schemaVersion: "2.0"
id: "101"
slug: discovered-task-needs-promotion
title: Discovered task needs promotion
lane: discovered
status: todo
createdAt: "2026-04-01"
updatedAt: "2026-04-01"
discoveredFromTask: "002"
tags:
  - agent-runtime
codeTargets:
  - packages/project-arch/src/core/agentRuntime/prepare.ts
publicDocs:
  - feedback/2-agent-command-surface-spec.md
decisions: []
completionCriteria:
  - Task is promoted before agent execution.
scope: Discovered work item.
---

# Discovered task needs promotion
`,
      "utf8",
    );

    await fs.writeFile(
      path.join(discoveredDir, "102-discovered-task-promoted.md"),
      `---
schemaVersion: "2.0"
id: "102"
slug: discovered-task-promoted
title: Discovered task promoted
lane: discovered
status: todo
createdAt: "2026-04-01"
updatedAt: "2026-04-01"
discoveredFromTask: "002"
agent:
  executable: true
tags:
  - agent-runtime
codeTargets:
  - packages/project-arch/src/core/agentRuntime/prepare.ts
publicDocs:
  - feedback/2-agent-command-surface-spec.md
decisions: []
completionCriteria:
  - Promoted discovered task can be prepared.
scope: Discovered work item.
---

# Discovered task promoted
`,
      "utf8",
    );
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("prepares a run and writes run-scoped artifacts by default", async () => {
    const result = await agentPrepare({ taskId: "002", cwd: context.tempDir });

    resultAssertions.assertSuccess(result);
    expect(result.data.schemaVersion).toBe(AGENT_RUNTIME_OUTPUT_SCHEMA_VERSION);
    expect(result.data.runId).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d{6}$/);
    expect(result.data.contractPath).toBe(
      `.project-arch/agent-runtime/contracts/${result.data.runId}.json`,
    );
    expect(result.data.promptPath).toBe(
      `.project-arch/agent-runtime/prompts/${result.data.runId}.md`,
    );
    expect(result.data.prompt).toBeUndefined();
    expect(await fs.pathExists(path.join(context.tempDir, result.data.contractPath))).toBe(true);
    expect(await fs.pathExists(path.join(context.tempDir, result.data.promptPath))).toBe(true);

    const contractRaw = await fs.readJson(path.join(context.tempDir, result.data.contractPath));
    const contract = agentTaskContractSchema.parse(contractRaw);

    expect(contract.runId).toBe(result.data.runId);
    expect(contract.taskId).toBe("002");
    expect(contract.scope.allowedPaths).toEqual(
      expect.arrayContaining([
        "packages/project-arch/src/cli/commands/agent.ts",
        "packages/project-arch/src/**",
      ]),
    );
    expect(contract.architectureContext.relevantDocs).toEqual(
      expect.arrayContaining([
        "feedback/2-agent-command-surface-spec.md",
        "roadmap/projects/shared/phases/phase-agent-command-surface/overview.md",
        "roadmap/projects/shared/phases/phase-agent-command-surface/milestones/milestone-1-prepare-and-result-import/overview.md",
      ]),
    );
    expect(contract.verification.commands).toEqual(
      expect.arrayContaining(["pa check --json", "pnpm test", "pnpm typecheck"]),
    );
  });

  it("supports prompt-only mode without writing files", async () => {
    const result = await agentPrepare({
      taskId: "002",
      cwd: context.tempDir,
      promptOnly: true,
    });

    resultAssertions.assertSuccess(result);
    expect(result.data.runId).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d{6}$/);
    expect(result.data.prompt).toContain("# Agent Task Prompt:");
    expect(result.data.prompt).toContain("Implement pa agent prepare command");
    expect(await fs.pathExists(path.join(context.tempDir, result.data.contractPath))).toBe(false);
    expect(await fs.pathExists(path.join(context.tempDir, result.data.promptPath))).toBe(false);
  });

  it("prepares doc-only planned tasks when publicDocs are declared", async () => {
    const result = await agentPrepare({ taskId: "003", cwd: context.tempDir });

    resultAssertions.assertSuccess(result);
    const contractRaw = await fs.readJson(path.join(context.tempDir, result.data.contractPath));
    const contract = agentTaskContractSchema.parse(contractRaw);

    expect(contract.scope.allowedPaths).toEqual(
      expect.arrayContaining([
        "architecture/product-framing/prompt.md",
        "architecture/product-framing/project-overview.md",
      ]),
    );
    expect(contract.architectureContext.relevantDocs).toEqual(
      expect.arrayContaining([
        "architecture/product-framing/prompt.md",
        "architecture/product-framing/project-overview.md",
      ]),
    );
  });

  it("supports check mode without writing files", async () => {
    const result = await agentPrepare({ taskId: "002", cwd: context.tempDir, check: true });

    resultAssertions.assertSuccess(result);
    expect(result.data.prompt).toBeUndefined();
    expect(await fs.pathExists(path.join(context.tempDir, result.data.contractPath))).toBe(false);
    expect(await fs.pathExists(path.join(context.tempDir, result.data.promptPath))).toBe(false);
  });

  it("returns a PAA001 error when the task is missing", async () => {
    const result = await agentPrepare({ taskId: "999", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "PAA001: Task 999 was not found");
    expect(result.success).toBe(false);
    const errors = result.success ? "" : (result.errors ?? []).join(" ");
    expect(errors).not.toContain("Approval required");
  });

  it("returns an authorization error for discovered task without explicit promotion", async () => {
    const result = await agentPrepare({ taskId: "101", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "PAA013: Approval required");
    resultAssertions.assertErrorContains(result, "requires explicit promotion");
  });

  it("allows discovered task execution after explicit promotion", async () => {
    const result = await agentPrepare({ taskId: "102", cwd: context.tempDir });
    resultAssertions.assertSuccess(result);
    expect(result.data.taskId).toBe("102");
    expect(result.data.status).toBe("prepared");
  });

  it("returns PAA012 when the required milestone overview is missing", async () => {
    await fs.remove(
      path.join(
        context.tempDir,
        "roadmap",
        "projects",
        "shared",
        "phases",
        "phase-agent-command-surface",
        "milestones",
        "milestone-1-prepare-and-result-import",
        "overview.md",
      ),
    );

    const result = await agentPrepare({ taskId: "002", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "PAA012: Milestone overview missing");
  });

  it("returns PAA012 when the required project manifest is missing", async () => {
    await fs.remove(path.join(context.tempDir, "roadmap", "projects", "shared", "manifest.json"));

    const result = await agentPrepare({ taskId: "002", cwd: context.tempDir });
    resultAssertions.assertErrorContains(result, "PAA012: Project manifest missing");
  });

  it("classifies approval-required prepare failures", () => {
    const message =
      "Approval required: Task 101 requires explicit promotion before agent execution.";
    expect(classifyAgentPrepareFailure(message)).toBe("approval-required");
    expect(getAgentPrepareExitCode(message)).toBe(2);
  });

  it("classifies ineligible prepare failures", () => {
    const message = "Task 301 is in lane 'icebox' and is not authorized for agent execution.";
    expect(classifyAgentPrepareFailure(message)).toBe("ineligible");
    expect(getAgentPrepareExitCode(message)).toBe(1);
  });

  it("classifies generic prepare failures", () => {
    const message = "Project manifest missing for project 'shared'.";
    expect(classifyAgentPrepareFailure(message)).toBe("error");
    expect(getAgentPrepareExitCode(message)).toBe(1);
  });
});
