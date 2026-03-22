/**
 * Safe identifier validation for filesystem-facing ids (phaseId, milestoneId, etc.).
 *
 * Allowed pattern: one or more lowercase alphanumeric segments joined by single hyphens.
 * Examples of valid ids: "phase-1", "milestone-1-setup", "m1", "my-phase"
 * Examples of rejected ids: "../evil", "/abs", "Has Spaces", "UPPER", "", "a--b", "a-"
 */

const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Assert that `id` is a filesystem-safe identifier.
 *
 * Throws an Error if `id` does not match the safe-id pattern.
 * The `label` argument names the field in the error message (e.g. "phaseId").
 */
export function assertSafeId(id: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(id)) {
    throw new Error(`${label} must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ — got: ${JSON.stringify(id)}`);
  }
}
