import { describe, expect, it } from "vitest";
import { runtimeAdapterUserConfigSchema } from "./runtimeAdapterUserConfig";

describe("schemas/runtimeAdapterUserConfig", () => {
  it("accepts bounded http-endpoint and binary-path adapter declarations", () => {
    const parsed = runtimeAdapterUserConfigSchema.parse({
      schemaVersion: "2.0",
      adapters: [
        {
          runtime: "cursor-agent",
          displayName: "Cursor Agent",
          probeType: "http-endpoint",
          probeTarget: "http://localhost:2050/v1/models",
          suggestedModel: "claude-3-7-sonnet",
          description: "Local Cursor endpoint",
        },
        {
          runtime: "claude-code",
          displayName: "Claude Code CLI",
          probeType: "binary-path",
          probeTarget: "claude",
          suggestedModel: "claude-3-7-sonnet",
        },
      ],
    });

    expect(parsed.adapters).toHaveLength(2);
  });

  it("rejects unsupported or unsafe fields", () => {
    expect(() =>
      runtimeAdapterUserConfigSchema.parse({
        schemaVersion: "2.0",
        adapters: [
          {
            runtime: "unsafe-adapter",
            displayName: "Unsafe Adapter",
            probeType: "binary-path",
            probeTarget: "my-tool",
            command: "sh -c 'rm -rf /'",
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      runtimeAdapterUserConfigSchema.parse({
        schemaVersion: "2.0",
        adapters: [
          {
            runtime: "unsafe-auth",
            displayName: "Unsafe Auth",
            probeType: "http-endpoint",
            probeTarget: "http://user:pass@localhost:1337/v1/models",
          },
        ],
      }),
    ).toThrow(/embedded credentials/i);
  });

  it("rejects non-http(s) endpoint schemes and non-executable binary targets", () => {
    expect(() =>
      runtimeAdapterUserConfigSchema.parse({
        schemaVersion: "2.0",
        adapters: [
          {
            runtime: "bad-scheme",
            displayName: "Bad Scheme",
            probeType: "http-endpoint",
            probeTarget: "file:///tmp/models.json",
          },
        ],
      }),
    ).toThrow(/http or https/i);

    expect(() =>
      runtimeAdapterUserConfigSchema.parse({
        schemaVersion: "2.0",
        adapters: [
          {
            runtime: "bad-binary",
            displayName: "Bad Binary",
            probeType: "binary-path",
            probeTarget: "./custom-script.sh",
          },
        ],
      }),
    ).toThrow(/executable name/i);
  });

  it("rejects duplicate runtime identifiers", () => {
    expect(() =>
      runtimeAdapterUserConfigSchema.parse({
        schemaVersion: "2.0",
        adapters: [
          {
            runtime: "cursor-agent",
            displayName: "Cursor Agent A",
            probeType: "http-endpoint",
            probeTarget: "http://localhost:2050/v1/models",
          },
          {
            runtime: "cursor-agent",
            displayName: "Cursor Agent B",
            probeType: "http-endpoint",
            probeTarget: "http://localhost:3050/v1/models",
          },
        ],
      }),
    ).toThrow(/Duplicate adapter runtime id/i);
  });
});
