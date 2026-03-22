import path from "path";

export interface TerminalSanitizeOptions {
  allowNewlines?: boolean;
  allowTabs?: boolean;
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function stripAnsiEscapeSequences(value: string): string {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code !== 27) {
      output += value[index];
      continue;
    }

    const next = value.charCodeAt(index + 1);
    if (next !== 91) {
      continue;
    }

    index += 2;
    while (index < value.length) {
      const current = value.charCodeAt(index);
      if (current >= 64 && current <= 126) {
        break;
      }
      index += 1;
    }
  }

  return output;
}

function isUnsafeControlCode(code: number): boolean {
  const isC0 = (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31);
  const isDelete = code === 127;
  const isC1 = code >= 128 && code <= 159;
  return isC0 || isDelete || isC1;
}

export function stripUnsafeControlChars(
  input: string,
  options: TerminalSanitizeOptions = {},
): string {
  const allowNewlines = options.allowNewlines !== false;
  const allowTabs = options.allowTabs !== false;

  let sanitized = "";
  const withoutAnsi = stripAnsiEscapeSequences(normalizeLineBreaks(input));
  for (const character of withoutAnsi) {
    if (!isUnsafeControlCode(character.charCodeAt(0))) {
      sanitized += character;
    }
  }

  if (!allowNewlines) {
    sanitized = sanitized.replace(/\n/g, " ");
  }

  if (!allowTabs) {
    sanitized = sanitized.replace(/\t/g, " ");
  }

  return sanitized;
}

export function minimizeAbsolutePathExposure(input: string, cwd = process.cwd()): string {
  const normalizedCwd = path.resolve(cwd).replace(/\\/g, "/");
  const normalizedInput = input.replace(/\\/g, "/");
  const cwdWithSep = normalizedCwd.endsWith("/") ? normalizedCwd : `${normalizedCwd}/`;

  if (normalizedInput === normalizedCwd) {
    return ".";
  }

  if (normalizedInput.includes(cwdWithSep)) {
    return normalizedInput.split(cwdWithSep).join("");
  }

  return normalizedInput;
}

export function sanitizeTerminalText(input: string, options: TerminalSanitizeOptions = {}): string {
  const stripped = stripUnsafeControlChars(input, options);
  return minimizeAbsolutePathExposure(stripped);
}

export function isDebugOutputEnabled(env = process.env): boolean {
  const debug = env.PA_DEBUG ?? env.DEBUG;
  if (!debug) {
    return false;
  }
  return /^(1|true|yes)$/i.test(debug) || /\bpa\b/i.test(debug);
}

export function formatErrorForTerminal(
  error: unknown,
  options: { includeStack?: boolean; cwd?: string } = {},
): string {
  const cwd = options.cwd ?? process.cwd();

  if (error instanceof Error) {
    if (options.includeStack && error.stack) {
      const relativeRoot = path.resolve(cwd).replace(/\\/g, "/");
      return sanitizeTerminalText(error.stack, { allowNewlines: true, allowTabs: false })
        .split(relativeRoot)
        .join(".");
    }

    return sanitizeTerminalText(error.message, { allowNewlines: true, allowTabs: false });
  }

  return sanitizeTerminalText(String(error), { allowNewlines: true, allowTabs: false });
}
