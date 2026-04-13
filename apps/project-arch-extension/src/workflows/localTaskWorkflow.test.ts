import { describe, expect, it } from "vitest";
import { runLocalTaskWorkflow } from "./localTaskWorkflow.js";
import type { ProjectArchBoundary } from "../integration/projectArchBoundary";

describe("localTaskWorkflow", () => {
  it("runs plan workflow through canonical prepare command", async () => {
    const calls: string[][] = [];

    const state = await runLocalTaskWorkflow({
      action: "plan",
      taskRef: "001",
      now: () => "2026-04-02T12:00:00.000Z",
      boundary: {
        transport: "cli-json",
        cliCommand: "pa",
        parseArtifact: (_kind: string, payload: unknown) => payload as never,
        parseResultBundle: (payload: unknown) => payload as never,
        parseRuntimeInventoryListResult: (payload: unknown) => payload as never,
        parseRuntimeReadinessCheckResult: (payload: unknown) => payload as never,
        parseRuntimeScanResult: (payload: unknown) => payload as never,
        readRuntimeInventoryList: async () => ({}) as never,
        readRuntimeReadinessCheck: async () => ({}) as never,
        readRuntimeScan: async () => ({}) as never,
        runCliJson: async <T>({ args }: { args: string[] }): Promise<T> => {
          calls.push(args);
          return {
            success: true,
            data: {
              schemaVersion: "2.0",
              runId: "run-2026-04-02-120000",
              taskRef: "001",
              status: "prepared",
              contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
              promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-120000.md",
            },
          } as T;
        },
      },
    });

    expect(calls).toEqual([["agent", "prepare", "001"]]);
    expect(state.action).toBe("plan");
    expect(state.runId).toBe("run-2026-04-02-120000");
    expect(state.artifacts.contractPath).toContain("contracts/");
  });

  it("runs explain workflow using prepare --prompt-only", async () => {
    const calls: string[][] = [];

    const state = await runLocalTaskWorkflow({
      action: "explain",
      taskRef: "001",
      now: () => "2026-04-02T12:00:00.000Z",
      boundary: {
        transport: "cli-json",
        cliCommand: "pa",
        parseArtifact: (_kind: string, payload: unknown) => payload as never,
        parseResultBundle: (payload: unknown) => payload as never,
        parseRuntimeInventoryListResult: (payload: unknown) => payload as never,
        parseRuntimeReadinessCheckResult: (payload: unknown) => payload as never,
        parseRuntimeScanResult: (payload: unknown) => payload as never,
        readRuntimeInventoryList: async () => ({}) as never,
        readRuntimeReadinessCheck: async () => ({}) as never,
        readRuntimeScan: async () => ({}) as never,
        runCliJson: async <T>({ args }: { args: string[] }): Promise<T> => {
          calls.push(args);
          return {
            success: true,
            data: {
              schemaVersion: "2.0",
              runId: "run-2026-04-02-120000",
              taskRef: "001",
              status: "prepared",
              contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
              promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-120000.md",
              prompt: "# Agent Task Prompt",
            },
          } as T;
        },
      },
    });

    expect(calls).toEqual([["agent", "prepare", "001", "--prompt-only"]]);
    expect(state.prepare.prompt).toContain("Agent Task Prompt");
  });

  it("runs full implement workflow prepare->import->validate->reconcile", async () => {
    const calls: string[][] = [];

    const state = await runLocalTaskWorkflow({
      action: "implement",
      taskRef: "001",
      resultBundlePath: "./result-bundle.json",
      now: () => "2026-04-02T12:00:00.000Z",
      boundary: {
        transport: "cli-json",
        cliCommand: "pa",
        parseArtifact: (_kind: string, payload: unknown) => payload as never,
        parseResultBundle: (payload: unknown) => payload as never,
        parseRuntimeInventoryListResult: (payload: unknown) => payload as never,
        parseRuntimeReadinessCheckResult: (payload: unknown) => payload as never,
        parseRuntimeScanResult: (payload: unknown) => payload as never,
        readRuntimeInventoryList: async () => ({}) as never,
        readRuntimeReadinessCheck: async () => ({}) as never,
        readRuntimeScan: async () => ({}) as never,
        runCliJson: async <T>({ args }: { args: string[] }): Promise<T> => {
          calls.push(args);

          if (args[0] === "agent" && args[1] === "prepare") {
            return {
              success: true,
              data: {
                schemaVersion: "2.0",
                runId: "run-2026-04-02-120000",
                taskRef: "001",
                status: "prepared",
                contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-02-120000.json",
                promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-02-120000.md",
              },
            } as T;
          }

          if (args[0] === "result" && args[1] === "import") {
            return {
              schemaVersion: "2.0",
              runId: "run-2026-04-02-120500",
              taskRef: "001",
              status: "imported",
              resultPath: ".project-arch/agent-runtime/results/run-2026-04-02-120500.json",
            } as T;
          }

          if (args[0] === "agent" && args[1] === "validate") {
            return {
              success: true,
              data: {
                schemaVersion: "2.0",
                runId: "run-2026-04-02-120500",
                taskRef: "001",
                status: "validation-passed",
                ok: true,
                runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-120500.json",
              },
            } as T;
          }

          return {
            success: true,
            data: {
              schemaVersion: "2.0",
              runId: "run-2026-04-02-120500",
              taskRef: "001",
              status: "reconciled",
              reportPath: ".project-arch/reconcile/001-2026-04-02.json",
              reportMarkdownPath: ".project-arch/reconcile/001-2026-04-02.md",
              runRecordPath: ".project-arch/agent-runtime/runs/run-2026-04-02-120500.json",
              escalationDraftPaths: [],
            },
          } as T;
        },
      } satisfies ProjectArchBoundary,
    });

    expect(calls).toEqual([
      ["agent", "prepare", "001"],
      ["result", "import", "./result-bundle.json"],
      ["agent", "validate", "run-2026-04-02-120500"],
      ["agent", "reconcile", "run-2026-04-02-120500"],
    ]);
    expect(state.imported?.status).toBe("imported");
    expect(state.validated?.ok).toBe(true);
    expect(state.reconciled?.status).toBe("reconciled");
  });
});
