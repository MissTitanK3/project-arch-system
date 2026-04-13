import { describe, expect, it } from "vitest";
import {
  agentRuntimeAdapterOptionValidationResultSchema,
  agentRuntimeAdapterReadinessInputSchema,
  agentRuntimeAdapterReadinessResultSchema,
} from "./agentRuntimeAdapterReadiness";

describe("schemas/agentRuntimeAdapterReadiness", () => {
  it("accepts bounded adapter readiness input and missing-auth diagnostics", () => {
    const input = agentRuntimeAdapterReadinessInputSchema.parse({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      profileId: "codex-implementer",
      model: "gpt-5.4",
      parameters: {
        reasoningEffort: "high",
      },
      adapterOptions: {
        approvalMode: "workspace-write",
      },
    });

    const result = agentRuntimeAdapterReadinessResultSchema.parse({
      schemaVersion: "2.0",
      runtime: input.runtime,
      profileId: input.profileId,
      status: "missing-auth",
      diagnostics: [
        {
          code: "missing-auth",
          severity: "error",
          message: "Codex CLI is installed, but no authenticated session is available.",
          nextStep: "Authenticate the runtime, then re-run readiness check.",
          docsHint: "pa runtime check codex-implementer",
        },
      ],
    });

    expect(result.status).toBe("missing-auth");
  });

  it("accepts invalid adapter option validation with multiple actionable diagnostics", () => {
    const result = agentRuntimeAdapterOptionValidationResultSchema.parse({
      schemaVersion: "2.0",
      runtime: "claude-cli",
      profileId: "claude-planner",
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-config",
          severity: "error",
          message: "approvalMode must be one of readonly, workspace-write, or full-access.",
          nextStep: "Update adapterOptions.approvalMode to a supported value.",
        },
        {
          code: "invalid-config",
          severity: "error",
          message: "sandboxMode cannot be used with the selected runtime profile.",
          nextStep: "Remove sandboxMode or choose a compatible runtime setting.",
        },
      ],
    });

    expect(result.diagnostics).toHaveLength(2);
  });

  it("rejects non-ready readiness results without diagnostics", () => {
    expect(() =>
      agentRuntimeAdapterReadinessResultSchema.parse({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        profileId: "codex-implementer",
        status: "missing-binary",
        diagnostics: [],
      }),
    ).toThrow(/must include at least one diagnostic/i);
  });

  it("rejects invalid option validation results that do not use invalid-config diagnostics", () => {
    expect(() =>
      agentRuntimeAdapterOptionValidationResultSchema.parse({
        schemaVersion: "2.0",
        runtime: "codex-cli",
        profileId: "codex-implementer",
        status: "invalid",
        diagnostics: [
          {
            code: "missing-auth",
            severity: "error",
            message: "Unexpected mismatch.",
            nextStep: "Fix configuration.",
          },
        ],
      }),
    ).toThrow(/must use code='invalid-config'/i);
  });
});
