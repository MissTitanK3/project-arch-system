import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiffFirstReviewModel } from "./localDiffReview";
import { LOCAL_WORKFLOW_STATE_KEY } from "../activation";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-extension-review-"));
  tempRoots.push(root);
  return root;
}

describe("localDiffReview", () => {
  it("builds review model from canonical result artifact in workspace state", async () => {
    const cwd = await makeTempRoot();
    const resultPath = ".project-arch/agent-runtime/results/run-2026-04-02-140000.json";
    const absoluteResultPath = path.join(cwd, resultPath);

    await fs.mkdir(path.dirname(absoluteResultPath), { recursive: true });
    await fs.writeFile(
      absoluteResultPath,
      JSON.stringify(
        {
          schemaVersion: "2.0",
          runId: "run-2026-04-02-140000",
          taskId: "003",
          runtime: { name: "codex-cli" },
          status: "completed",
          summary: "Implemented diff-first review.",
          changedFiles: [
            "apps/project-arch-extension/src/activation.ts",
            "apps/project-arch-extension/src/review/localDiffReview.ts",
          ],
          commandsRun: [{ command: "pnpm --filter project-arch-extension verify", exitCode: 0 }],
          evidence: {
            diffSummary: "Added review command.",
            changedFileCount: 2,
            testsPassed: true,
            lintPassed: true,
            typecheckPassed: true,
          },
          policyFindings: [],
          completedAt: "2026-04-02T14:00:00.000Z",
        },
        null,
        2,
      ),
      "utf8",
    );

    const model = await buildDiffFirstReviewModel({
      cwd,
      context: {
        workspaceState: {
          get: <T>(key: string): T | undefined => {
            if (key !== LOCAL_WORKFLOW_STATE_KEY) {
              return undefined;
            }
            return {
              action: "implement",
              taskRef: "003",
              runId: "run-2026-04-02-140000",
              transport: "cli-json",
              startedAt: "2026-04-02T14:00:00.000Z",
              completedAt: "2026-04-02T14:01:00.000Z",
              prepare: {
                schemaVersion: "2.0",
                runId: "run-2026-04-02-135900",
                taskRef: "003",
                status: "prepared",
                contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-135900.json",
                promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-135900.md",
              },
              artifacts: {
                contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-135900.json",
                promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-135900.md",
                resultPath,
                runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-140000.json",
                reportPath: ".project-arch/reconcile/003-2026-04-02.json",
                reportMarkdownPath: ".project-arch/reconcile/003-2026-04-02.md",
              },
            } as T;
          },
        },
      },
    });

    expect(model.taskRef).toBe("003");
    expect(model.runId).toBe("run-2026-04-02-140000");
    expect(model.changedFiles).toHaveLength(2);
    expect(model.reportPath).toBe(".project-arch/reconcile/003-2026-04-02.json");
  });

  it("fails when workflow state is missing", async () => {
    await expect(
      buildDiffFirstReviewModel({
        context: {
          workspaceState: {
            get: () => undefined,
          },
        },
      }),
    ).rejects.toThrow("No local workflow state is available");
  });
});
