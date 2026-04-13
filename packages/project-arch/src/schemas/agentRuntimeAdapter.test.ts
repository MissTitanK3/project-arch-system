import { describe, expect, it } from "vitest";
import {
  agentRuntimeAdapterRegistrationSchema,
  agentRuntimeIdSchema,
  agentRuntimeLaunchInputSchema,
  agentRuntimeLaunchRecordSchema,
  agentRuntimeLaunchResultSchema,
} from "./agentRuntimeAdapter";
import {
  agentRuntimeAdapterOptionValidationResultSchema,
  agentRuntimeAdapterReadinessResultSchema,
} from "./agentRuntimeAdapterReadiness";

describe("schemas/agentRuntimeAdapter", () => {
  it("accepts deterministic adapter registrations", () => {
    const registration = agentRuntimeAdapterRegistrationSchema.parse({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      displayName: "Codex CLI",
      launchContract: "agent-runtime-launch-v1",
      ownership: "adapter-managed",
      description: "Launches local Codex sessions.",
    });

    expect(registration.runtime).toBe("codex-cli");
  });

  it("accepts launch input and launch result contracts", () => {
    const launchInput = agentRuntimeLaunchInputSchema.parse({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      runId: "run-2026-04-01-190000",
      taskId: "001",
      contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-190000.json",
      promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-190000.md",
      allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      requestedAt: "2026-04-01T19:00:00.000Z",
      lifecycleBoundary: "prepare-first",
    });

    const launchResult = agentRuntimeLaunchResultSchema.parse({
      schemaVersion: "2.0",
      runtime: launchInput.runtime,
      runId: launchInput.runId,
      taskId: launchInput.taskId,
      status: "launch-dispatched",
      runHandle: "codex-cli:run-2026-04-01-190000",
      launchedAt: "2026-04-01T19:00:05.000Z",
      lifecycleBoundary: "prepare-first",
    });

    expect(launchResult.status).toBe("launch-dispatched");
  });

  it("accepts persisted launch records for dispatched and failed launches", () => {
    const dispatched = agentRuntimeLaunchRecordSchema.parse({
      schemaVersion: "2.0",
      runId: "run-2026-04-01-190001",
      taskId: "001",
      runtime: "codex-cli",
      status: "launch-dispatched",
      contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-190001.json",
      promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-190001.md",
      allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      requestedAt: "2026-04-01T19:00:00.000Z",
      lifecycleBoundary: "prepare-first",
      runHandle: "codex-cli:run-2026-04-01-190001",
      launchedAt: "2026-04-01T19:00:05.000Z",
    });

    const failed = agentRuntimeLaunchRecordSchema.parse({
      schemaVersion: "2.0",
      runId: "run-2026-04-01-190002",
      taskId: "001",
      runtime: "codex-cli",
      status: "launch-failed",
      contractPath: ".project-arch/agent-runtime/contracts/run-2026-04-01-190002.json",
      promptPath: ".project-arch/agent-runtime/prompts/run-2026-04-01-190002.md",
      allowedPaths: ["packages/project-arch/src/core/agentRuntime/"],
      requestedAt: "2026-04-01T19:00:00.000Z",
      lifecycleBoundary: "prepare-first",
      failedAt: "2026-04-01T19:00:07.000Z",
      error: "PAA017: Runtime adapter 'codex-cli' launch timed out after 5000ms.",
    });

    expect(dispatched.status).toBe("launch-dispatched");
    expect(failed.status).toBe("launch-failed");
  });

  it("rejects malformed runtime ids", () => {
    expect(() => agentRuntimeIdSchema.parse("Codex CLI")).toThrow();
  });

  it("accepts adapter readiness and option validation contracts", () => {
    const readiness = agentRuntimeAdapterReadinessResultSchema.parse({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      profileId: "codex-implementer",
      status: "missing-auth",
      diagnostics: [
        {
          code: "missing-auth",
          severity: "error",
          message: "Authentication is required.",
          nextStep: "Authenticate the runtime.",
        },
      ],
    });

    const validation = agentRuntimeAdapterOptionValidationResultSchema.parse({
      schemaVersion: "2.0",
      runtime: "codex-cli",
      profileId: "codex-implementer",
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-config",
          severity: "error",
          message: "approvalMode is invalid.",
          nextStep: "Use a supported approvalMode value.",
        },
      ],
    });

    expect(readiness.status).toBe("missing-auth");
    expect(validation.status).toBe("invalid");
  });
});
