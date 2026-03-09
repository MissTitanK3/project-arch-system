/**
 * Status Normalization Utilities
 *
 * Provides deterministic mapping from legacy status formats to canonical enum.
 * Ensures backward compatibility while enforcing schema-level consistency.
 */

import { z } from "zod";

/**
 * Canonical task status enum (source of truth)
 * Uses underscores for consistency with identifiers
 */
export const CANONICAL_TASK_STATUSES = ["todo", "in_progress", "done", "blocked"] as const;
export type CanonicalTaskStatus = (typeof CANONICAL_TASK_STATUSES)[number];

/**
 * Legacy status formats that may exist in older repositories
 */
const LEGACY_STATUS_MAP: Record<string, CanonicalTaskStatus> = {
  // Hyphenated variants (from CLI docs, templates)
  "in-progress": "in_progress",

  // Already canonical
  todo: "todo",
  in_progress: "in_progress",
  done: "done",
  blocked: "blocked",
};

/**
 * Normalize a status value to canonical format
 * @param status - Raw status string (may be legacy or canonical)
 * @returns Canonical status or null if invalid
 */
export function normalizeTaskStatus(status: string): CanonicalTaskStatus | null {
  const normalized = status.trim().toLowerCase();
  return LEGACY_STATUS_MAP[normalized] ?? null;
}

/**
 * Zod preprocessing transformer for task status
 * Automatically normalizes legacy formats before validation
 */
export const taskStatusSchema = z.preprocess((val) => {
  if (typeof val !== "string") {
    return val; // Let zod validation handle non-strings
  }
  const normalized = normalizeTaskStatus(val);
  if (normalized === null) {
    // Return original value to trigger validation error with meaningful message
    return val;
  }
  return normalized;
}, z.enum(CANONICAL_TASK_STATUSES));

export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * Validate and normalize status value
 * @throws {z.ZodError} if status is invalid
 */
export function validateTaskStatus(status: string): CanonicalTaskStatus {
  return taskStatusSchema.parse(status);
}

/**
 * Check if a status value is valid (canonical or legacy)
 */
export function isValidTaskStatus(status: string): boolean {
  return normalizeTaskStatus(status) !== null;
}

/**
 * Display format for CLI output (using hyphens for readability)
 */
export function formatTaskStatusForDisplay(status: CanonicalTaskStatus): string {
  return status === "in_progress" ? "in-progress" : status;
}

/**
 * Parse status from user input (CLI args, etc.)
 * Accepts both canonical and legacy formats
 */
export function parseTaskStatusInput(input: string): CanonicalTaskStatus {
  const normalized = normalizeTaskStatus(input);
  if (normalized === null) {
    const valid = Object.keys(LEGACY_STATUS_MAP).join(", ");
    throw new Error(`Invalid status: '${input}'. Valid values: ${valid}`);
  }
  return normalized;
}
