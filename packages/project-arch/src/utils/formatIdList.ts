/**
 * Smart ID list formatting for readability with large counts
 */

export interface FormatIdListOptions {
  /**
   * Maximum number of IDs to show before truncating
   * @default 7
   */
  maxDisplay?: number;

  /**
   * Show all IDs regardless of count
   * @default false
   */
  verbose?: boolean;
}

/**
 * Format an array of IDs for display, truncating long lists intelligently
 *
 * Examples:
 * - Short list: "001, 002, 003"
 * - Long list (concise): "001, 002, 003 ... 097, 098, 099 (99 total)"
 * - Long list (verbose): "001, 002, 003, ... 099"
 *
 * @param ids - Array of ID strings to format
 * @param options - Formatting options
 * @returns Formatted string suitable for console display
 */
export function formatIdList(ids: string[], options: FormatIdListOptions = {}): string {
  const { maxDisplay = 7, verbose = false } = options;

  if (ids.length === 0) {
    return "(none)";
  }

  // Always show all if count is small or verbose mode
  if (ids.length <= maxDisplay || verbose) {
    return ids.join(", ");
  }

  // Smart truncation: show first N/2 and last N/2
  const showCount = Math.max(1, Math.floor(maxDisplay / 2));
  const firstIds = ids.slice(0, showCount);
  const lastIds = ids.slice(-showCount);

  // Avoid showing duplicates if the ranges overlap
  if (firstIds.length + lastIds.length >= ids.length) {
    return ids.join(", ");
  }

  const parts = [firstIds.join(", ")];
  if (showCount > 0) {
    parts.push("...");
  }
  parts.push(lastIds.join(", "));

  return `${parts.join(" ")} (${ids.length} total)`;
}

/**
 * Format a count with label for display
 *
 * @param used - Number of used items
 * @param total - Total capacity
 * @param label - Optional label (default: "Used")
 * @returns Formatted string like "Used: 42/99"
 */
export function formatUsageCount(used: number, total: number, label: string = "Used"): string {
  return `${label}: ${used}/${total}`;
}

/**
 * Format next available ID with fallback message
 *
 * @param nextId - Next available ID or null
 * @param label - Optional label (default: "Next")
 * @returns Formatted string like "Next: 043" or "Next: (none available)"
 */
export function formatNextId(nextId: string | null, label: string = "Next"): string {
  return `${label}: ${nextId || "(none available)"}`;
}
