import {
  formatErrorForTerminal,
  isDebugOutputEnabled,
  sanitizeTerminalText,
} from "../../utils/outputSafety";

/**
 * Validation hint utilities for CLI error messages
 */

export interface ValidationHint {
  pattern: RegExp;
  hint: string;
}

export interface ErrorHintOptions {
  includeStack?: boolean;
}

/**
 * Common validation patterns and hints
 */
export const VALIDATION_HINTS: ValidationHint[] = [
  {
    pattern: /milestone.*not found|milestone.*does not exist/i,
    hint: "Try 'pa milestone new <phaseId> <milestoneId>' to create the milestone first",
  },
  {
    pattern: /phase.*not found|phase.*does not exist/i,
    hint: "Try 'pa phase new <phaseId>' to create the phase first",
  },
  {
    pattern: /task.*already exists/i,
    hint: "Use 'pa task lanes <phaseId> <milestoneId>' to see existing tasks",
  },
  {
    pattern: /decision.*not found/i,
    hint: "Use 'pa decision list' to see all decisions",
  },
  {
    pattern: /invalid.*id.*format|must be.*digit/i,
    hint: "Try 'pa help commands' to see ID format requirements",
  },
  {
    pattern: /schema.*validation.*failed/i,
    hint: "Use 'pa check' to validate all files, or see 'pa help standards' for schema requirements",
  },
  {
    pattern: /graph.*not found/i,
    hint: "The architecture graph may need to be rebuilt (this should happen automatically)",
  },
];

/**
 * Add a helpful hint to an error message if applicable
 */
export function addHintToError(error: Error): string {
  const message = formatErrorForTerminal(error, { includeStack: false });

  for (const { pattern, hint } of VALIDATION_HINTS) {
    if (pattern.test(message)) {
      return `${message}\n\nHint: ${sanitizeTerminalText(hint, { allowNewlines: false, allowTabs: false })}`;
    }
  }

  // Default hint
  return `${message}\n\nHint: Try 'pa help' for more information`;
}

export function formatErrorWithHint(error: unknown, options: ErrorHintOptions = {}): string {
  const includeStack = options.includeStack === true && isDebugOutputEnabled();

  if (error instanceof Error) {
    const sanitizedMessage = formatErrorForTerminal(error, { includeStack });
    for (const { pattern, hint } of VALIDATION_HINTS) {
      if (pattern.test(sanitizedMessage)) {
        return `${sanitizedMessage}\n\nHint: ${sanitizeTerminalText(hint, { allowNewlines: false, allowTabs: false })}`;
      }
    }
    return `${sanitizedMessage}\n\nHint: Try 'pa help' for more information`;
  }

  const fallback = formatErrorForTerminal(error, { includeStack: false });
  return `${fallback}\n\nHint: Try 'pa help' for more information`;
}

/**
 * Wrap a command handler with error handling and hints
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHints<T extends any[]>(
  handler: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error("ERROR:", formatErrorWithHint(error));
      process.exitCode = 1;
    }
  };
}
