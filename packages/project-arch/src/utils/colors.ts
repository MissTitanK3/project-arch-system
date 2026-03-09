/**
 * Lightweight ANSI color utilities for CLI output
 * No external dependencies required
 */

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";

// Colors
const cyan = "\x1b[36m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const magenta = "\x1b[35m";
const gray = "\x1b[90m";

/**
 * Check if colors should be disabled (CI environments, non-TTY, etc.)
 */
function shouldUseColors(): boolean {
  // NO_COLOR environment variable convention
  if (process.env.NO_COLOR) {
    return false;
  }

  // Check if stdout is a TTY
  if (!process.stdout.isTTY) {
    return false;
  }

  // FORCE_COLOR environment variable
  if (process.env.FORCE_COLOR) {
    return true;
  }

  return true;
}

/**
 * Apply color to text if colors are enabled
 */
function colorize(text: string, colorCode: string): string {
  return shouldUseColors() ? `${colorCode}${text}${reset}` : text;
}

export const colors = {
  bold: (text: string) => colorize(text, bold),
  dim: (text: string) => colorize(text, dim),
  cyan: (text: string) => colorize(text, cyan),
  green: (text: string) => colorize(text, green),
  yellow: (text: string) => colorize(text, yellow),
  blue: (text: string) => colorize(text, blue),
  magenta: (text: string) => colorize(text, magenta),
  gray: (text: string) => colorize(text, gray),

  // Convenience methods
  heading: (text: string) => colorize(text, `${bold}${cyan}`),
  command: (text: string) => colorize(text, green),
  option: (text: string) => colorize(text, yellow),
  separator: (text: string) => colorize(text, gray),
};
