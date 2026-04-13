import { describe, expect, it } from "vitest";

import {
  agentContractAdditiveTaskContextFieldPaths,
  agentContractArtifactKinds,
  agentContractConsumptionHooks,
  agentContractIntegrationBoundary,
  isAgentResultBundle,
  isAgentRuntimeLaunchRecord,
  isRuntimeInventoryListResult,
  parseRuntimeInventoryListResult,
  parseRuntimeReadinessCheckResult,
  parseAgentRoleOrchestrationContract,
  parseAgentExtensionCliJsonArtifact,
  parseAgentContractArtifact,
  parseAgentRuntimeLaunchRecord,
  parseAgentTaskContract,
  safeParseAgentEscalationRequest,
} from "./contracts";

const taskContract = {
  schemaVersion: "2.0" as const,
  runId: "run-2026-04-01-001",
  taskId: "003",
  status: "authorized" as const,
  title: "Define VS Code extension contract consumption hooks",
  objective: "Expose stable SDK consumption hooks for editor integrations.",
  lane: "planned" as const,
  trustLevel: "t1-scoped-edit" as const,
  scope: {
    allowedPaths: ["packages/project-arch/src/sdk/contracts.ts"],
    blockedPaths: [],
    allowedOperations: ["read", "write", "run-tests", "run-typecheck"],
    blockedOperations: ["install-dependency"],
  },
  architectureContext: {
    projectId: "shared",
    phaseId: "phase-agent-contract-schemas",
    milestoneId: "milestone-3-extension-and-standards-hooks",
    taskPath:
      "feedback/phases/phase-agent-contract-schemas/milestones/milestone-3-extension-and-standards-hooks/tasks/planned/003-define-vscode-extension-contract-consumption-hooks.md",
    relatedDecisions: [],
    relevantDocs: [
      "feedback/4-vscode-agent-integration-spec.md",
      "feedback/1-agent-contract-schemas.md",
    ],
    relevantSkills: [],
    externalStandards: [
      {
        id: "owasp-cheatsheet-authentication",
        title: "Authentication Cheat Sheet",
        url: "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
      },
    ],
  },
  successCriteria: ["Extension-facing hooks are public and additive."],
  verification: {
    commands: ["pnpm --filter project-arch exec vitest run src/sdk/contracts.test.ts"],
    requiredEvidence: ["SDK contract consumption tests pass."],
  },
  escalationRules: ["public-contract-change"],
  preparedAt: "2026-04-01T10:00:00.000Z",
};

const resultBundle = {
  schemaVersion: "2.0" as const,
  runId: "run-2026-04-01-001",
  taskId: "003",
  runtime: {
    name: "copilot",
  },
  status: "completed" as const,
  summary: "Added explicit SDK contract consumption hooks.",
  changedFiles: ["packages/project-arch/src/sdk/contracts.ts"],
  commandsRun: [{ command: "pnpm test", exitCode: 0 }],
  evidence: {
    diffSummary: "SDK contracts now expose stable public parse hooks.",
    changedFileCount: 1,
    testsPassed: true,
    lintPassed: true,
    typecheckPassed: true,
  },
  policyFindings: [],
  completedAt: "2026-04-01T10:15:00.000Z",
};

const escalationRequest = {
  schemaVersion: "2.0" as const,
  runId: "run-2026-04-01-001",
  taskId: "003",
  escalationType: "public-contract-change" as const,
  severity: "low" as const,
  summary: "Document any future public contract additions.",
  details: ["The SDK surface is additive and must remain version-safe."],
  options: [{ label: "note in changelog", impact: "improves visibility" }],
  recommendedNextStep: "create-decision-draft" as const,
  createdAt: "2026-04-01T10:20:00.000Z",
};

const launchRecord = {
  schemaVersion: "2.0" as const,
  runId: "run-2026-04-01-001",
  taskId: "003",
  runtime: "codex-cli",
  status: "launch-dispatched" as const,
  contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-001.json",
  promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-001.md",
  allowedPaths: ["packages/project-arch/src/sdk/contracts.ts"],
  requestedAt: "2026-04-01T10:05:00.000Z",
  lifecycleBoundary: "prepare-first" as const,
  runHandle: "codex-cli:run-2026-04-01-001",
  launchedAt: "2026-04-01T10:05:05.000Z",
};

const roleOrchestrationContract = {
  schemaVersion: "2.0" as const,
  runId: "run-2026-04-01-001",
  taskId: "003",
  authorityModel: "single-agent-lifecycle" as const,
  lifecycleModel: "prepare-run-validate-reconcile" as const,
  roleContracts: [
    {
      role: "planner" as const,
      trustLevel: "t0-readonly" as const,
      operationProfile: "read-context" as const,
      outputBoundary: "prepare" as const,
      consumesArtifacts: ["task-contract" as const],
      producesArtifacts: ["prompt" as const],
      scopePaths: ["packages/project-arch/src/sdk/"],
    },
    {
      role: "implementer" as const,
      trustLevel: "t1-scoped-edit" as const,
      operationProfile: "implement-within-scope" as const,
      outputBoundary: "validate" as const,
      consumesArtifacts: ["task-contract" as const, "prompt" as const],
      producesArtifacts: ["result-bundle" as const],
      scopePaths: ["packages/project-arch/src/sdk/"],
    },
    {
      role: "reviewer" as const,
      trustLevel: "t0-readonly" as const,
      operationProfile: "validate-and-review" as const,
      outputBoundary: "reconcile" as const,
      consumesArtifacts: ["result-bundle" as const, "task-contract" as const],
      producesArtifacts: ["run-record" as const, "review-surface" as const],
      scopePaths: ["packages/project-arch/src/sdk/"],
    },
    {
      role: "reconciler" as const,
      trustLevel: "t1-scoped-edit" as const,
      operationProfile: "reconcile-reporting" as const,
      outputBoundary: "reconcile" as const,
      consumesArtifacts: ["run-record" as const, "result-bundle" as const],
      producesArtifacts: ["reconciliation-report" as const],
      scopePaths: ["packages/project-arch/src/sdk/"],
    },
  ],
  handoffs: [
    {
      fromRole: "planner" as const,
      toRole: "implementer" as const,
      lifecycleBoundary: "prepare" as const,
      requiredArtifacts: ["task-contract" as const, "prompt" as const],
      authorityModel: "single-agent-lifecycle" as const,
      trustBoundary: "inherit-authorized-task-scope" as const,
    },
    {
      fromRole: "implementer" as const,
      toRole: "reviewer" as const,
      lifecycleBoundary: "validate" as const,
      requiredArtifacts: ["result-bundle" as const, "task-contract" as const],
      authorityModel: "single-agent-lifecycle" as const,
      trustBoundary: "inherit-authorized-task-scope" as const,
    },
    {
      fromRole: "reviewer" as const,
      toRole: "reconciler" as const,
      lifecycleBoundary: "reconcile" as const,
      requiredArtifacts: ["run-record" as const, "review-surface" as const],
      authorityModel: "single-agent-lifecycle" as const,
      trustBoundary: "inherit-authorized-task-scope" as const,
    },
  ],
  createdAt: "2026-04-01T10:22:00.000Z",
};

const runtimeInventoryListResult = {
  schemaVersion: "2.0" as const,
  status: "runtime-inventory" as const,
  defaultProfile: "codex-implementer",
  runtimes: [
    {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      available: true,
      availabilitySource: "adapter-registry" as const,
      profiles: ["codex-implementer"],
    },
  ],
  profiles: [
    {
      id: "codex-implementer",
      runtime: "codex-cli",
      model: "gpt-5.4",
      enabled: true,
      default: true,
      linked: true,
      available: true,
      readiness: "ready" as const,
      status: "ready" as const,
      diagnostics: [],
    },
  ],
};

const runtimeReadinessCheckResult = {
  schemaVersion: "2.0" as const,
  status: "runtime-readiness-check" as const,
  checkedAt: "2026-04-03T22:00:00.000Z",
  profileId: "claude-planner",
  profiles: [
    {
      id: "claude-planner",
      runtime: "claude-cli",
      enabled: true,
      default: false,
      linked: true,
      available: true,
      readiness: "missing-auth" as const,
      status: "not-ready" as const,
      diagnostics: [
        {
          code: "missing-auth",
          severity: "error" as const,
          message: "No authenticated runtime session is available.",
          nextStep: "Authenticate runtime credentials.",
        },
      ],
    },
  ],
};

describe("sdk/contracts", () => {
  it("exposes stable artifact kinds for extension consumers", () => {
    expect(agentContractArtifactKinds).toEqual([
      "task-contract",
      "result-bundle",
      "escalation-request",
      "runtime-adapter-registration",
      "runtime-launch-input",
      "runtime-launch-record",
      "runtime-launch-result",
      "role-orchestration-contract",
      "runtime-inventory-list-result",
      "runtime-readiness-check-result",
    ]);
  });

  it("parses task contracts through the public SDK hook", () => {
    expect(parseAgentTaskContract(taskContract)).toEqual(taskContract);
    expect(parseAgentContractArtifact("task-contract", taskContract)).toEqual(taskContract);
    expect(parseAgentExtensionCliJsonArtifact("task-contract", taskContract)).toEqual(taskContract);
  });

  it("offers safe parsing for extension callers", () => {
    const parsed = safeParseAgentEscalationRequest(escalationRequest);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(escalationRequest);
    }

    expect(safeParseAgentEscalationRequest({ taskId: "003" }).success).toBe(false);
  });

  it("provides artifact type guards without runtime-private coupling", () => {
    const unknownArtifact: unknown = resultBundle;

    expect(isAgentResultBundle(unknownArtifact)).toBe(true);
    if (isAgentResultBundle(unknownArtifact)) {
      expect(unknownArtifact.status).toBe("completed");
    }

    expect(isAgentResultBundle(taskContract)).toBe(false);
  });

  it("aggregates the public hook surface in one extension-facing registry", () => {
    expect(agentContractConsumptionHooks.schemas["task-contract"]).toBeDefined();
    expect(agentContractConsumptionHooks.parseResultBundle(resultBundle)).toEqual(resultBundle);
    expect(agentContractConsumptionHooks.isEscalationRequest(escalationRequest)).toBe(true);
    expect(parseAgentContractArtifact("runtime-launch-record", launchRecord)).toEqual(launchRecord);
    expect(parseAgentRuntimeLaunchRecord(launchRecord)).toEqual(launchRecord);
    expect(agentContractConsumptionHooks.isRuntimeLaunchRecord(launchRecord)).toBe(true);
    expect(isAgentRuntimeLaunchRecord(launchRecord)).toBe(true);
    expect(parseAgentRoleOrchestrationContract(roleOrchestrationContract)).toEqual(
      roleOrchestrationContract,
    );
    expect(
      parseAgentContractArtifact("role-orchestration-contract", roleOrchestrationContract),
    ).toEqual(roleOrchestrationContract);
    expect(
      agentContractConsumptionHooks.isRoleOrchestrationContract(roleOrchestrationContract),
    ).toBe(true);
    expect(parseRuntimeInventoryListResult(runtimeInventoryListResult)).toEqual(
      runtimeInventoryListResult,
    );
    expect(parseRuntimeReadinessCheckResult(runtimeReadinessCheckResult)).toEqual(
      runtimeReadinessCheckResult,
    );
    expect(isRuntimeInventoryListResult(runtimeInventoryListResult)).toBe(true);
    expect(
      parseAgentContractArtifact("runtime-inventory-list-result", runtimeInventoryListResult),
    ).toEqual(runtimeInventoryListResult);
    expect(
      parseAgentContractArtifact("runtime-readiness-check-result", runtimeReadinessCheckResult),
    ).toEqual(runtimeReadinessCheckResult);
    expect(
      agentContractConsumptionHooks.parseRuntimeInventoryListResult(runtimeInventoryListResult),
    ).toEqual(runtimeInventoryListResult);
    expect(
      agentContractConsumptionHooks.parseRuntimeReadinessCheckResult(runtimeReadinessCheckResult),
    ).toEqual(runtimeReadinessCheckResult);
  });

  it("publishes one additive-growth boundary for extension and standards consumers", () => {
    expect(agentContractAdditiveTaskContextFieldPaths).toEqual([
      "architectureContext.externalStandards",
    ]);
    expect(agentContractIntegrationBoundary.extension.consumesArtifactKinds).toEqual(
      agentContractArtifactKinds,
    );
    expect(agentContractIntegrationBoundary.standards.supportedTaskContextRepresentations).toEqual([
      "string-id",
      "structured-reference",
    ]);
    expect(agentContractIntegrationBoundary.standards.commandSurface).toBe("deferred");
  });

  it("declares MVP and deferred command boundaries for consumer compatibility", () => {
    expect(agentContractIntegrationBoundary.extension.mvpCommandSurface).toEqual([
      "pa agent prepare",
      "pa agent run",
      "pa agent status",
      "pa agent orchestrate",
      "pa result import",
      "pa agent validate",
      "pa agent reconcile",
      "pa agent audit",
    ]);
    expect(agentContractIntegrationBoundary.extension.runtimeLocalArtifacts).toEqual([
      "orchestration-record",
      "orchestration-audit-trail",
      "runtime-audit-log",
    ]);
    expect(agentContractIntegrationBoundary.extension.deferredCommands).toEqual([
      "pa agent escalate",
    ]);
  });
});
