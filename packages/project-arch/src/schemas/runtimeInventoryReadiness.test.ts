import { describe, expect, it } from "vitest";
import {
  runtimeInventoryListResultSchema,
  runtimeReadinessCheckResultSchema,
} from "./runtimeInventoryReadiness";

describe("schemas/runtimeInventoryReadiness", () => {
  it("accepts a valid merged runtime inventory result", () => {
    const parsed = runtimeInventoryListResultSchema.parse({
      schemaVersion: "2.0",
      status: "runtime-inventory",
      defaultProfile: "codex-implementer",
      runtimes: [
        {
          runtime: "codex-cli",
          displayName: "Codex CLI",
          description: "OpenAI Codex adapter",
          available: true,
          availabilitySource: "adapter-registry",
          profiles: ["codex-implementer"],
        },
      ],
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          label: "Codex Implementer",
          purpose: "Primary implementation runtime",
          model: "gpt-5.4",
          enabled: true,
          default: true,
          linked: true,
          available: true,
          readiness: "ready",
          status: "ready",
          diagnostics: [],
        },
      ],
    });

    expect(parsed.defaultProfile).toBe("codex-implementer");
    expect(parsed.profiles[0]?.readiness).toBe("ready");
  });

  it("accepts config-file runtime availability source for user-declared adapters", () => {
    const parsed = runtimeInventoryListResultSchema.parse({
      schemaVersion: "2.0",
      status: "runtime-inventory",
      runtimes: [
        {
          runtime: "cursor-agent",
          displayName: "Cursor Agent",
          available: true,
          availabilitySource: "config-file",
          profiles: [],
        },
      ],
      profiles: [],
    });

    expect(parsed.runtimes[0]?.availabilitySource).toBe("config-file");
  });

  it("rejects inventory defaultProfile references that are not present", () => {
    expect(() =>
      runtimeInventoryListResultSchema.parse({
        schemaVersion: "2.0",
        status: "runtime-inventory",
        defaultProfile: "missing",
        runtimes: [],
        profiles: [],
      }),
    ).toThrow(/defaultProfile must reference an id from profiles/i);
  });

  it("rejects disabled profile entries that drift from disabled readiness semantics", () => {
    expect(() =>
      runtimeInventoryListResultSchema.parse({
        schemaVersion: "2.0",
        status: "runtime-inventory",
        runtimes: [],
        profiles: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            enabled: true,
            default: false,
            linked: true,
            available: true,
            readiness: "ready",
            status: "disabled",
            diagnostics: [],
          },
        ],
      }),
    ).toThrow(/Disabled profiles must set enabled=false/i);
  });

  it("accepts a valid readiness-check result with actionable diagnostics", () => {
    const parsed = runtimeReadinessCheckResultSchema.parse({
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt: "2026-04-03T20:00:00.000Z",
      profileId: "claude-planner",
      profiles: [
        {
          id: "claude-planner",
          runtime: "claude-cli",
          enabled: true,
          default: false,
          linked: true,
          available: true,
          readiness: "missing-auth",
          status: "not-ready",
          diagnostics: [
            {
              code: "missing-auth",
              severity: "error",
              message: "No authenticated runtime session is available.",
              nextStep: "Authenticate runtime credentials, then re-run readiness check.",
              docsHint: "pa runtime help claude-cli",
            },
          ],
        },
      ],
    });

    expect(parsed.profiles[0]?.diagnostics[0]?.nextStep).toContain("Authenticate");
  });

  it("rejects profile-scoped readiness checks without exactly one matching profile", () => {
    expect(() =>
      runtimeReadinessCheckResultSchema.parse({
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-03T20:00:00.000Z",
        profileId: "codex-implementer",
        profiles: [],
      }),
    ).toThrow(/must return exactly one matching profile/i);
  });
});
