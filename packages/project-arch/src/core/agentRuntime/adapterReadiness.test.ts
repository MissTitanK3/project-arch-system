import { describe, expect, it } from "vitest";
import {
  parseAgentRuntimeAdapterOptionValidationInput,
  parseAgentRuntimeAdapterOptionValidationResult,
  parseAgentRuntimeAdapterReadinessInput,
  parseAgentRuntimeAdapterReadinessResult,
  safeParseAgentRuntimeAdapterOptionValidationResult,
  safeParseAgentRuntimeAdapterReadinessResult,
} from "./adapterReadiness";

describe("core/agentRuntime/adapterReadiness", () => {
  it("parses adapter readiness hook input and result contracts", () => {
    const input = parseAgentRuntimeAdapterReadinessInput({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      profileId: "codex-implementer",
      model: "gpt-5.4",
      adapterOptions: {
        approvalMode: "workspace-write",
      },
    });

    const result = parseAgentRuntimeAdapterReadinessResult({
      schemaVersion: "2.0",
      runtime: input.runtime,
      profileId: input.profileId,
      status: "missing-binary",
      diagnostics: [
        {
          code: "missing-binary",
          severity: "error",
          message: "Required CLI executable was not found on PATH.",
          nextStep: "Install the runtime binary, then re-run readiness check.",
        },
      ],
    });

    expect(result.status).toBe("missing-binary");
  });

  it("returns unsuccessful safe parse for invalid readiness results", () => {
    const parsed = safeParseAgentRuntimeAdapterReadinessResult({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      profileId: "codex-implementer",
      status: "missing-auth",
      diagnostics: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("parses adapter option validation input and result contracts", () => {
    const input = parseAgentRuntimeAdapterOptionValidationInput({
      schemaVersion: "2.0",
      runtime: "claude-cli",
      profileId: "claude-planner",
      model: "claude-opus-4",
      adapterOptions: {
        sandboxMode: "readonly",
      },
    });

    const result = parseAgentRuntimeAdapterOptionValidationResult({
      schemaVersion: "2.0",
      runtime: input.runtime,
      profileId: input.profileId,
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-config",
          severity: "error",
          message: "sandboxMode is not supported for this profile.",
          nextStep: "Remove sandboxMode or select a compatible profile.",
        },
      ],
    });

    expect(result.status).toBe("invalid");
  });

  it("returns unsuccessful safe parse for invalid option validation results", () => {
    const parsed = safeParseAgentRuntimeAdapterOptionValidationResult({
      schemaVersion: "2.0",
      runtime: "claude-cli",
      profileId: "claude-planner",
      status: "valid",
      diagnostics: [
        {
          code: "invalid-config",
          severity: "error",
          message: "Should not be present.",
          nextStep: "Remove the invalid diagnostic.",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
