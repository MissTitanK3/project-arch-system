import { describe, it, expect } from "vitest";
import { reconcileConfigSchema } from "./reconcileConfig";

describe("schemas/reconcileConfig", () => {
  it("accepts a minimal valid config", () => {
    const parsed = reconcileConfigSchema.parse({
      extends: "default",
    });

    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.extends).toBe("default");
    expect(parsed.lifecycle.mode).toBe("append-only-history");
    expect(parsed.lifecycle.writeCanonicalPointers).toBe(false);
    expect(parsed.triggers.include).toEqual([]);
    expect(parsed.triggers.exclude).toEqual([]);
    expect(parsed.triggers.overrides).toEqual([]);
  });

  it("accepts lifecycle mode and canonical pointer settings", () => {
    const parsed = reconcileConfigSchema.parse({
      extends: "default",
      lifecycle: {
        mode: "current-state-record",
        writeCanonicalPointers: true,
      },
    });

    expect(parsed.lifecycle.mode).toBe("current-state-record");
    expect(parsed.lifecycle.writeCanonicalPointers).toBe(true);
  });

  it("accepts include/exclude/override rules", () => {
    const parsed = reconcileConfigSchema.parse({
      schemaVersion: "1.0",
      extends: "default",
      triggers: {
        include: [
          {
            pathPattern: "apps/web/src/critical",
            changeType: "code",
            status: "required",
          },
        ],
        exclude: [
          {
            trigger: "schema-contract",
            pathPattern: "apps/web/src/generated",
            downgradeTo: "suggested",
          },
        ],
        overrides: [{ trigger: "unresolved-drift", status: "none" }],
      },
    });

    expect(parsed.triggers.include).toHaveLength(1);
    expect(parsed.triggers.exclude).toHaveLength(1);
    expect(parsed.triggers.overrides).toHaveLength(1);
  });

  it("rejects config if extends is not default", () => {
    expect(() =>
      reconcileConfigSchema.parse({
        extends: "custom",
      }),
    ).toThrow();
  });

  it("rejects include/exclude rule without match keys", () => {
    expect(() =>
      reconcileConfigSchema.parse({
        extends: "default",
        triggers: {
          include: [{ status: "required" }],
        },
      }),
    ).toThrow(/At least one of trigger, pathPattern, domain, or changeType/);
  });

  it("rejects disabling all default triggers via overrides", () => {
    expect(() =>
      reconcileConfigSchema.parse({
        extends: "default",
        triggers: {
          overrides: [
            { trigger: "architecture-surface", status: "none" },
            { trigger: "module-boundary", status: "none" },
            { trigger: "schema-contract", status: "none" },
            { trigger: "terminology", status: "none" },
            { trigger: "milestone-target", status: "none" },
            { trigger: "unresolved-drift", status: "none" },
          ],
        },
      }),
    ).toThrow(/cannot disable all default triggers/i);
  });
});
