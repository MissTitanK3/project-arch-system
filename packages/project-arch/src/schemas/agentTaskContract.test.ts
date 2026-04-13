import { describe, expect, it } from "vitest";
import {
  agentAllowedOperationSchema,
  agentBlockedOperationSchema,
  agentEscalationRuleSchema,
  agentTaskContractSchema,
  agentTrustLevelSchema,
} from "./agentTaskContract";

describe("schemas/agentTaskContract", () => {
  const validContract = {
    schemaVersion: "2.0" as const,
    taskId: "104",
    runId: "run-2026-03-31-001",
    status: "authorized" as const,
    title: "Implement agent result import command",
    objective: "Add CLI and SDK support for importing structured agent result bundles.",
    lane: "planned" as const,
    trustLevel: "t1-scoped-edit" as const,
    scope: {
      allowedPaths: [
        "packages/project-arch/src/cli/commands/**",
        "packages/project-arch/src/core/agentRuntime/**",
        "packages/project-arch/src/schemas/**",
        "packages/project-arch/src/sdk/**",
        "feedback/**",
      ],
      blockedPaths: [".github/**", "infra/**"],
      allowedOperations: ["read", "write", "create", "run-tests", "run-lint", "run-typecheck"],
      blockedOperations: ["install-dependency", "modify-ci", "change-public-api-without-decision"],
    },
    architectureContext: {
      projectId: "shared",
      phaseId: "phase-2",
      milestoneId: "milestone-3",
      taskPath:
        "roadmap/projects/shared/phases/phase-2/milestones/milestone-3/tasks/planned/104-task.md",
      relatedDecisions: ["ADR-014"],
      relevantDocs: ["packages/project-arch/docs/reconciliation-report-schema.md"],
      relevantSkills: [".arch/agents-of-arch/skills/repo-map/system.md"],
    },
    successCriteria: [
      "Command exists and validates input shape",
      "SDK wrapper exists",
      "Schema docs are updated",
      "No out-of-scope file changes",
    ],
    verification: {
      commands: ["pnpm --filter project-arch test", "pnpm --filter project-arch typecheck"],
      requiredEvidence: ["diff-summary", "changed-files", "command-results"],
    },
    escalationRules: [
      "requires-new-dependency",
      "public-contract-change",
      "undocumented-cross-domain-dependency",
    ],
    preparedAt: "2026-03-31T12:00:00.000Z",
  };

  it("accepts a valid prepared agent task contract", () => {
    expect(agentTaskContractSchema.parse(validContract)).toEqual(validContract);
  });

  it("accepts optional architecture extension points", () => {
    const parsed = agentTaskContractSchema.parse({
      ...validContract,
      architectureContext: {
        ...validContract.architectureContext,
        externalStandards: ["owasp-asvs-4.0.3"],
      },
    });

    expect(parsed.architectureContext.externalStandards).toEqual(["owasp-asvs-4.0.3"]);
  });

  it("accepts structured external standards references without breaking string ids", () => {
    const parsed = agentTaskContractSchema.parse({
      ...validContract,
      architectureContext: {
        ...validContract.architectureContext,
        externalStandards: [
          "owasp-asvs-4.0.3",
          {
            id: "owasp-cheatsheet-authentication",
            title: "Authentication Cheat Sheet",
            url: "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
            source: "owasp-cheatsheet-series",
          },
        ],
      },
    });

    expect(parsed.architectureContext.externalStandards).toEqual([
      "owasp-asvs-4.0.3",
      {
        id: "owasp-cheatsheet-authentication",
        title: "Authentication Cheat Sheet",
        url: "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
        source: "owasp-cheatsheet-series",
      },
    ]);
  });

  it("rejects empty success criteria", () => {
    expect(() =>
      agentTaskContractSchema.parse({
        ...validContract,
        successCriteria: [],
      }),
    ).toThrow();
  });

  it("rejects invalid task ids and timestamps", () => {
    expect(() =>
      agentTaskContractSchema.parse({
        ...validContract,
        taskId: "task-104",
      }),
    ).toThrow();

    expect(() =>
      agentTaskContractSchema.parse({
        ...validContract,
        preparedAt: "2026-03-31",
      }),
    ).toThrow();
  });

  it("rejects empty verification and escalation payloads", () => {
    expect(() =>
      agentTaskContractSchema.parse({
        ...validContract,
        verification: {
          commands: [],
          requiredEvidence: validContract.verification.requiredEvidence,
        },
      }),
    ).toThrow();

    expect(() =>
      agentTaskContractSchema.parse({
        ...validContract,
        escalationRules: [],
      }),
    ).toThrow();
  });

  it("rejects unsupported policy enum values", () => {
    expect(() => agentTrustLevelSchema.parse("t4-admin")).toThrow();
    expect(() => agentAllowedOperationSchema.parse("run-build")).toThrow();
    expect(() => agentBlockedOperationSchema.parse("force-push")).toThrow();
    expect(() => agentEscalationRuleSchema.parse("missing-standard")).toThrow();
  });

  it("rejects non-authorized contract status", () => {
    expect(() =>
      agentTaskContractSchema.parse({
        ...validContract,
        status: "prepared",
      }),
    ).toThrow();
  });
});
