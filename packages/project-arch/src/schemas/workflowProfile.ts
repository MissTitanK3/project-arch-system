import { z } from "zod";

export const workflowProfileSchema = z.enum(["quality", "balanced", "budget"]);

export type WorkflowProfile = z.infer<typeof workflowProfileSchema>;

/**
 * Workflow Profile Defaults
 *
 * Each profile defines strictness and scope behavior:
 * - quality: Strictest checks, all diagnostics, slowest, highest cost
 * - balanced: Default behavior, moderate checks, moderate speed/cost
 * - budget: Minimal checks, warnings only, fastest, lowest cost
 */

export interface ProfileDefaults {
  profile: WorkflowProfile;
  completenessThreshold: number;
  coverageMode: "warning" | "error";
  failFast: boolean;
  description: string;
}

export const PROFILE_DEFAULTS: Record<WorkflowProfile, ProfileDefaults> = {
  quality: {
    profile: "quality",
    completenessThreshold: 90,
    coverageMode: "error",
    failFast: false,
    description:
      "Strictest checks: decision completeness >=90%, plan coverage enforced as errors, all diagnostics emitted",
  },
  balanced: {
    profile: "balanced",
    completenessThreshold: 100,
    coverageMode: "warning",
    failFast: false,
    description:
      "Default checks: decision completeness >=100%, plan coverage warnings, all diagnostics emitted (backward compatible)",
  },
  budget: {
    profile: "budget",
    completenessThreshold: 0,
    coverageMode: "warning",
    failFast: true,
    description:
      "Minimal checks: no completeness requirement, plan coverage warnings only, stop at first error",
  },
};

export function getProfileDefaults(profile: WorkflowProfile | undefined): ProfileDefaults {
  if (!profile || profile === "balanced") {
    return PROFILE_DEFAULTS.balanced;
  }
  return PROFILE_DEFAULTS[profile];
}

/**
 * Resolve effective workflow profile with precedence: CLI > config > default
 */
export function resolveWorkflowProfile(
  cliProfile: WorkflowProfile | undefined,
  configProfile: WorkflowProfile | undefined,
): ProfileDefaults {
  const effectiveProfile = cliProfile || configProfile || "balanced";
  return getProfileDefaults(effectiveProfile);
}
