import { describe, it, expect } from "vitest";
import {
  workflowProfileSchema,
  PROFILE_DEFAULTS,
  getProfileDefaults,
  resolveWorkflowProfile,
} from "./workflowProfile";

describe("workflowProfileSchema", () => {
  it("should accept valid profile names", () => {
    expect(() => workflowProfileSchema.parse("quality")).not.toThrow();
    expect(() => workflowProfileSchema.parse("balanced")).not.toThrow();
    expect(() => workflowProfileSchema.parse("budget")).not.toThrow();
  });

  it("should reject invalid profile names", () => {
    expect(() => workflowProfileSchema.parse("strict")).toThrow();
    expect(() => workflowProfileSchema.parse("relaxed")).toThrow();
    expect(() => workflowProfileSchema.parse("")).toThrow();
  });
});

describe("PROFILE_DEFAULTS", () => {
  it("should have defaults for all three profiles", () => {
    expect(PROFILE_DEFAULTS).toHaveProperty("quality");
    expect(PROFILE_DEFAULTS).toHaveProperty("balanced");
    expect(PROFILE_DEFAULTS).toHaveProperty("budget");
  });

  it("quality profile should be strictest", () => {
    const quality = PROFILE_DEFAULTS.quality;
    expect(quality.completenessThreshold).toBe(90);
    expect(quality.coverageMode).toBe("error");
    expect(quality.failFast).toBe(false);
  });

  it("balanced profile should be moderate (default)", () => {
    const balanced = PROFILE_DEFAULTS.balanced;
    expect(balanced.completenessThreshold).toBe(100);
    expect(balanced.coverageMode).toBe("warning");
    expect(balanced.failFast).toBe(false);
  });

  it("budget profile should be minimal", () => {
    const budget = PROFILE_DEFAULTS.budget;
    expect(budget.completenessThreshold).toBe(0);
    expect(budget.coverageMode).toBe("warning");
    expect(budget.failFast).toBe(true);
  });
});

describe("getProfileDefaults", () => {
  it("should return balanced defaults when profile is undefined", () => {
    const defaults = getProfileDefaults(undefined);
    expect(defaults.profile).toBe("balanced");
    expect(defaults).toEqual(PROFILE_DEFAULTS.balanced);
  });

  it("should return balanced defaults when profile is explicitly balanced", () => {
    const defaults = getProfileDefaults("balanced");
    expect(defaults).toEqual(PROFILE_DEFAULTS.balanced);
  });

  it("should return quality defaults when profile is quality", () => {
    const defaults = getProfileDefaults("quality");
    expect(defaults).toEqual(PROFILE_DEFAULTS.quality);
  });

  it("should return budget defaults when profile is budget", () => {
    const defaults = getProfileDefaults("budget");
    expect(defaults).toEqual(PROFILE_DEFAULTS.budget);
  });
});

describe("resolveWorkflowProfile", () => {
  it("should prefer CLI profile over config profile", () => {
    const resolved = resolveWorkflowProfile("quality", "budget");
    expect(resolved.profile).toBe("quality");
  });

  it("should use config profile when CLI is undefined", () => {
    const resolved = resolveWorkflowProfile(undefined, "quality");
    expect(resolved.profile).toBe("quality");
  });

  it("should default to balanced when both are undefined", () => {
    const resolved = resolveWorkflowProfile(undefined, undefined);
    expect(resolved.profile).toBe("balanced");
  });

  it("should demonstrate full precedence order: CLI > config > balanced", () => {
    // CLI only
    expect(resolveWorkflowProfile("quality", undefined).profile).toBe("quality");

    // Config only
    expect(resolveWorkflowProfile(undefined, "budget").profile).toBe("budget");

    // Both (CLI wins)
    expect(resolveWorkflowProfile("budget", "quality").profile).toBe("budget");

    // Neither (default)
    expect(resolveWorkflowProfile(undefined, undefined).profile).toBe("balanced");
  });
});
