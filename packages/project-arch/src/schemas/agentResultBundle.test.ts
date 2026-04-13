import { describe, expect, it } from "vitest";
import {
  agentCommandRunSchema,
  agentDecisionRequestSchema,
  agentPolicyFindingSchema,
  agentResultBundleSchema,
  agentResultFindingSeveritySchema,
  agentResultStatusSchema,
} from "./agentResultBundle";

describe("schemas/agentResultBundle", () => {
  const validBundle = {
    schemaVersion: "2.0" as const,
    runId: "run-2026-03-31-001",
    taskId: "104",
    runtime: {
      name: "claude-code",
      version: "0.0.0-dev",
    },
    status: "completed-with-warnings" as const,
    summary:
      "Implemented CLI and SDK import flow. Validation helpers still need broader docs coverage.",
    changedFiles: [
      "packages/project-arch/src/cli/commands/result.ts",
      "packages/project-arch/src/sdk/result.ts",
      "packages/project-arch/src/schemas/agentResultBundle.ts",
    ],
    commandsRun: [
      {
        command: "pnpm --filter project-arch test",
        exitCode: 0,
      },
      {
        command: "pnpm --filter project-arch typecheck",
        exitCode: 0,
      },
    ],
    evidence: {
      diffSummary: "Added result import command and schema support.",
      changedFileCount: 3,
      testsPassed: true,
      lintPassed: true,
      typecheckPassed: true,
    },
    policyFindings: [
      {
        code: "undocumented-cross-domain-dependency",
        severity: "medium" as const,
        message: "Runtime output references feedback promotion behavior not yet documented.",
      },
    ],
    proposedDiscoveredTasks: [
      {
        title: "Document runtime result bundle promotion behavior",
        reason: "Implementation exposed an undocumented follow-up requirement.",
      },
    ],
    decisionRequests: [
      {
        schemaVersion: "2.0" as const,
        runId: "run-2026-03-31-001",
        taskId: "104",
        escalationType: "public-contract-change" as const,
        severity: "medium" as const,
        summary: "Clarify runtime promotion behavior decision",
        details: ["The implementation depends on a policy that is not ratified yet."],
        options: [
          {
            label: "create decision draft",
            impact: "captures the pending public contract choice",
          },
        ],
        recommendedNextStep: "create-decision-draft" as const,
        createdAt: "2026-03-31T12:10:00.000Z",
      },
    ],
    reconciliationHints: ["Update schema docs", "Review feedback export interaction"],
    completedAt: "2026-03-31T12:20:00.000Z",
  };

  it("accepts a valid agent result bundle", () => {
    expect(agentResultBundleSchema.parse(validBundle)).toEqual(validBundle);
  });

  it("accepts optional follow-up outputs being omitted", () => {
    const parsed = agentResultBundleSchema.parse({
      ...validBundle,
      runtime: {
        name: validBundle.runtime.name,
      },
      proposedDiscoveredTasks: undefined,
      decisionRequests: undefined,
      reconciliationHints: undefined,
    });

    expect(parsed.runtime.version).toBeUndefined();
    expect(parsed.proposedDiscoveredTasks).toBeUndefined();
    expect(parsed.decisionRequests).toBeUndefined();
    expect(parsed.reconciliationHints).toBeUndefined();
  });

  it("accepts additive evidence fields for future runtime metadata", () => {
    const parsed = agentResultBundleSchema.parse({
      ...validBundle,
      evidence: {
        ...validBundle.evidence,
        commandResultsIncluded: true,
      },
    });

    expect(parsed.evidence.commandResultsIncluded).toBe(true);
  });

  it("rejects invalid status, severity, and task identifiers", () => {
    expect(() => agentResultStatusSchema.parse("in-progress")).toThrow();
    expect(() => agentResultFindingSeveritySchema.parse("error")).toThrow();

    expect(() =>
      agentResultBundleSchema.parse({
        ...validBundle,
        taskId: "task-104",
      }),
    ).toThrow();
  });

  it("rejects invalid command results and timestamps", () => {
    expect(() =>
      agentCommandRunSchema.parse({
        command: "pnpm --filter project-arch test",
        exitCode: 0.5,
      }),
    ).toThrow();

    expect(() =>
      agentResultBundleSchema.parse({
        ...validBundle,
        completedAt: "2026-03-31",
      }),
    ).toThrow();
  });

  it("rejects malformed policy findings and decision requests", () => {
    expect(() =>
      agentPolicyFindingSchema.parse({
        code: "missing-standard",
        severity: "medium",
      }),
    ).toThrow();

    expect(() =>
      agentDecisionRequestSchema.parse({
        schemaVersion: "2.0",
        runId: "run-2026-03-31-001",
        taskId: "104",
        escalationType: "public-contract-change",
        severity: "medium",
        summary: "",
        details: ["Need a decision."],
        options: [{ label: "create decision draft", impact: "captures the issue" }],
        recommendedNextStep: "create-decision-draft",
        createdAt: "2026-03-31T12:10:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects malformed evidence payloads", () => {
    expect(() =>
      agentResultBundleSchema.parse({
        ...validBundle,
        evidence: {
          ...validBundle.evidence,
          changedFileCount: -1,
        },
      }),
    ).toThrow();
  });
});
