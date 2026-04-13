import { describe, expect, it } from "vitest";
import { runtimeProfileConfigSchema } from "./runtimeProfileConfig";

describe("schemas/runtimeProfileConfig", () => {
  it("accepts a valid runtime profile config", () => {
    const parsed = runtimeProfileConfigSchema.parse({
      schemaVersion: "2.0",
      defaultProfile: "codex-implementer",
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          enabled: true,
          label: "Codex Implementer",
          purpose: "Primary implementation runtime",
          preferredFor: ["run", "review"],
          model: "gpt-5.4",
          parameters: {
            reasoningEffort: "high",
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
          adapterOptions: {
            approvalMode: "workspace-write",
            nested: {
              sandboxMode: "workspace-write",
            },
          },
          updatedAt: "2026-04-03T20:00:00.000Z",
        },
      ],
    });

    expect(parsed.defaultProfile).toBe("codex-implementer");
    expect(parsed.profiles).toHaveLength(1);
  });

  it("defaults profile enabled to true when omitted", () => {
    const parsed = runtimeProfileConfigSchema.parse({
      schemaVersion: "2.0",
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "gpt-5.4",
        },
      ],
    });

    expect(parsed.profiles[0]?.enabled).toBe(true);
  });

  it("rejects unknown fields in config and profile objects", () => {
    expect(() =>
      runtimeProfileConfigSchema.parse({
        schemaVersion: "2.0",
        defaultProfile: "codex-implementer",
        profiles: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            model: "gpt-5.4",
            launchCommand: "codex run",
          },
        ],
        extra: true,
      }),
    ).toThrow();
  });

  it("rejects out-of-bounds common parameters", () => {
    expect(() =>
      runtimeProfileConfigSchema.parse({
        schemaVersion: "2.0",
        profiles: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            model: "gpt-5.4",
            parameters: {
              temperature: 4,
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate profile ids and invalid defaultProfile references", () => {
    const result = runtimeProfileConfigSchema.safeParse({
      schemaVersion: "2.0",
      defaultProfile: "missing",
      profiles: [
        {
          id: "shared",
          runtime: "codex-cli",
          model: "gpt-5.4",
        },
        {
          id: "shared",
          runtime: "claude-cli",
          model: "claude-opus-4",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["profiles", 1, "id"],
          message: "Duplicate runtime profile id 'shared' is not allowed.",
        }),
        expect.objectContaining({
          path: ["defaultProfile"],
          message: "defaultProfile must reference an id from profiles.",
        }),
      ]),
    );
  });

  it("rejects duplicate preferredFor values with explicit item paths", () => {
    const result = runtimeProfileConfigSchema.safeParse({
      schemaVersion: "2.0",
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "gpt-5.4",
          preferredFor: ["run", "run"],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["profiles", 0, "preferredFor", 1],
          message: "Duplicate preferredFor value 'run' is not allowed.",
        }),
      ]),
    );
  });

  it("rejects secret-oriented or executable option keys", () => {
    expect(() =>
      runtimeProfileConfigSchema.parse({
        schemaVersion: "2.0",
        profiles: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            model: "gpt-5.4",
            adapterOptions: {
              accessToken: "redacted",
              nested: {
                launchCommand: "codex run",
              },
            },
          },
        ],
      }),
    ).toThrow(
      /adapterOptions cannot include secret-oriented fields or executable adapter definitions/i,
    );
  });
});
