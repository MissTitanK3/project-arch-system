import { describe, expect, it } from "vitest";
import {
  agentAuditEventSchema,
  agentArtifactIdentitySchema,
  agentDecisionRequestSchema,
  agentEscalationDraftSchema,
  agentEscalationRequestSchema,
  agentRuntimeAdapterRegistrationSchema,
  agentRuntimeAdapterReadinessInputSchema,
  agentRuntimeAdapterReadinessResultSchema,
  agentRuntimeAdapterOptionValidationInputSchema,
  agentRuntimeAdapterOptionValidationResultSchema,
  agentRuntimeLaunchInputSchema,
  agentRuntimeLaunchRecordSchema,
  agentRuntimeLaunchResultSchema,
  runtimeInventoryListResultSchema,
  runtimeReadinessCheckResultSchema,
  runtimeProfileConfigSchema,
  agentRoleOrchestrationContractSchema,
  agentResultBundleSchema,
  agentTaskContractSchema,
} from "./agentContracts";

describe("schemas/agentContracts", () => {
  it("exports the shared artifact identity contract", () => {
    expect(
      agentArtifactIdentitySchema.parse({
        schemaVersion: "2.0",
        runId: "run-2026-03-31-001",
        taskId: "104",
      }),
    ).toEqual({
      schemaVersion: "2.0",
      runId: "run-2026-03-31-001",
      taskId: "104",
    });
  });

  it("keeps decision request parsing aligned with escalation requests", () => {
    const request = {
      schemaVersion: "2.0" as const,
      runId: "run-2026-03-31-001",
      taskId: "104",
      escalationType: "public-contract-change" as const,
      severity: "medium" as const,
      summary: "Public schema change needs approval.",
      details: ["A CLI-facing contract would change."],
      options: [{ label: "create ADR", impact: "adds approval step" }],
      recommendedNextStep: "create-decision-draft" as const,
      createdAt: "2026-03-31T12:10:00.000Z",
    };

    expect(agentDecisionRequestSchema.parse(request)).toEqual(
      agentEscalationRequestSchema.parse(request),
    );
  });

  it("exposes the three core schema modules as one coherent set", () => {
    expect(agentTaskContractSchema).toBeDefined();
    expect(agentResultBundleSchema).toBeDefined();
    expect(agentEscalationRequestSchema).toBeDefined();
    expect(agentEscalationDraftSchema).toBeDefined();
    expect(agentAuditEventSchema).toBeDefined();
    expect(agentRuntimeAdapterRegistrationSchema).toBeDefined();
    expect(agentRuntimeAdapterReadinessInputSchema).toBeDefined();
    expect(agentRuntimeAdapterReadinessResultSchema).toBeDefined();
    expect(agentRuntimeAdapterOptionValidationInputSchema).toBeDefined();
    expect(agentRuntimeAdapterOptionValidationResultSchema).toBeDefined();
    expect(agentRuntimeLaunchInputSchema).toBeDefined();
    expect(agentRuntimeLaunchRecordSchema).toBeDefined();
    expect(agentRuntimeLaunchResultSchema).toBeDefined();
    expect(runtimeProfileConfigSchema).toBeDefined();
    expect(runtimeInventoryListResultSchema).toBeDefined();
    expect(runtimeReadinessCheckResultSchema).toBeDefined();
    expect(agentRoleOrchestrationContractSchema).toBeDefined();
  });
});
