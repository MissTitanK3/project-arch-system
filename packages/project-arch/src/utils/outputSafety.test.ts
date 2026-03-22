import path from "path";
import { describe, expect, it } from "vitest";
import {
  formatErrorForTerminal,
  isDebugOutputEnabled,
  minimizeAbsolutePathExposure,
  sanitizeTerminalText,
  stripUnsafeControlChars,
} from "./outputSafety";

describe("utils/outputSafety", () => {
  it("strips ANSI escapes and unsafe control characters", () => {
    const value = "ok\x1b[31m-red\x1b[0m\x00\x07";
    expect(stripUnsafeControlChars(value)).toBe("ok-red");
  });

  it("removes newlines and tabs when disallowed", () => {
    const value = "line1\n\tline2";
    expect(stripUnsafeControlChars(value, { allowNewlines: false, allowTabs: false })).toBe(
      "line1  line2",
    );
  });

  it("minimizes repo absolute paths", () => {
    const cwd = "/tmp/project-arch-system";
    const absolute = `${cwd}/packages/project-arch/src/cli.ts`;
    expect(minimizeAbsolutePathExposure(absolute, cwd)).toBe("packages/project-arch/src/cli.ts");
  });

  it("sanitizes terminal text end-to-end", () => {
    const cwd = path.resolve(process.cwd());
    const value = `${cwd}/src/file.ts\x1b[32m\n`;
    const output = sanitizeTerminalText(value, { allowNewlines: false, allowTabs: false });
    expect(output).toContain("src/file.ts");
    expect(output).not.toContain("\x1b");
  });

  it("formats errors without stack by default", () => {
    const error = new Error("boom\x1b[31m");
    expect(formatErrorForTerminal(error)).toBe("boom");
  });

  it("formats errors with stack when explicitly enabled", () => {
    const error = new Error("boom");
    const output = formatErrorForTerminal(error, { includeStack: true });
    expect(output).toContain("Error: boom");
  });

  it("detects debug flags from env", () => {
    expect(isDebugOutputEnabled({ PA_DEBUG: "1" })).toBe(true);
    expect(isDebugOutputEnabled({ DEBUG: "pa" })).toBe(true);
    expect(isDebugOutputEnabled({ PA_DEBUG: "0" })).toBe(false);
  });
});
