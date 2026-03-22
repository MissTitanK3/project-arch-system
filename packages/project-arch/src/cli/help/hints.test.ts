import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addHintToError, formatErrorWithHint, VALIDATION_HINTS, withErrorHints } from "./hints";

describe("Validation Hints", () => {
  describe("VALIDATION_HINTS", () => {
    it("should have hints for milestone not found", () => {
      const hint = VALIDATION_HINTS.find((h) => h.pattern.test("milestone not found"));
      expect(hint).toBeDefined();
      expect(hint?.hint).toContain("pa milestone new");
    });

    it("should have hints for phase not found", () => {
      const hint = VALIDATION_HINTS.find((h) => h.pattern.test("phase not found"));
      expect(hint).toBeDefined();
      expect(hint?.hint).toContain("pa phase new");
    });

    it("should have hints for task already exists", () => {
      const hint = VALIDATION_HINTS.find((h) => h.pattern.test("task already exists"));
      expect(hint).toBeDefined();
      expect(hint?.hint).toContain("pa task lanes");
    });

    it("should have hints for decision not found", () => {
      const hint = VALIDATION_HINTS.find((h) => h.pattern.test("decision not found"));
      expect(hint).toBeDefined();
      expect(hint?.hint).toContain("pa decision list");
    });

    it("should have hints for invalid ID format", () => {
      const hint = VALIDATION_HINTS.find((h) => h.pattern.test("invalid id format"));
      expect(hint).toBeDefined();
      expect(hint?.hint).toContain("pa help commands");
    });

    it("should have hints for schema validation", () => {
      const hint = VALIDATION_HINTS.find((h) => h.pattern.test("schema validation failed"));
      expect(hint).toBeDefined();
      expect(hint?.hint).toContain("pa check");
    });
  });

  describe("addHintToError", () => {
    it("should add milestone hint for milestone not found error", () => {
      const error = new Error("Milestone not found: milestone-1");
      const result = addHintToError(error);

      expect(result).toContain("Milestone not found");
      expect(result).toContain("Hint:");
      expect(result).toContain("pa milestone new");
    });

    it("should add phase hint for phase not found error", () => {
      const error = new Error("Phase does not exist");
      const result = addHintToError(error);

      expect(result).toContain("Phase does not exist");
      expect(result).toContain("Hint:");
      expect(result).toContain("pa phase new");
    });

    it("should add task lanes hint for task already exists error", () => {
      const error = new Error("Task already exists: 001");
      const result = addHintToError(error);

      expect(result).toContain("Task already exists");
      expect(result).toContain("Hint:");
      expect(result).toContain("pa task lanes");
    });

    it("should add default hint for unknown error", () => {
      const error = new Error("Some random error");
      const result = addHintToError(error);

      expect(result).toContain("Some random error");
      expect(result).toContain("Hint:");
      expect(result).toContain("pa help");
    });

    it("should preserve original error message", () => {
      const error = new Error("Original error message");
      const result = addHintToError(error);

      expect(result).toContain("Original error message");
    });

    it("should add ID format hint for digit validation errors", () => {
      const error = new Error("ID must be 3 digits");
      const result = addHintToError(error);

      expect(result).toContain("must be");
      expect(result).toContain("digit");
      expect(result).toContain("Hint:");
      expect(result).toContain("pa help commands");
    });
  });
});

describe("withErrorHints", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it("should execute handler successfully without errors", async () => {
    const handler = vi.fn(async () => {
      // Success case
    });
    const wrappedHandler = withErrorHints(handler);

    await wrappedHandler();

    expect(handler).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("should catch errors and add hints", async () => {
    const handler = vi.fn(async () => {
      throw new Error("phase not found");
    });
    const wrappedHandler = withErrorHints(handler);

    await wrappedHandler();

    expect(handler).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "ERROR:",
      expect.stringContaining("phase not found"),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith("ERROR:", expect.stringContaining("Hint:"));
    expect(consoleErrorSpy).toHaveBeenCalledWith("ERROR:", expect.stringContaining("pa phase new"));
    expect(process.exitCode).toBe(1);
  });

  it("should handle non-Error thrown values", async () => {
    const handler = vi.fn(async () => {
      throw "string error";
    });
    const wrappedHandler = withErrorHints(handler);

    await wrappedHandler();

    expect(consoleErrorSpy).toHaveBeenCalledWith("ERROR:", expect.stringContaining("string error"));
    expect(consoleErrorSpy).toHaveBeenCalledWith("ERROR:", expect.stringContaining("Hint:"));
    expect(process.exitCode).toBe(1);
  });

  it("should pass arguments to the handler", async () => {
    const handler = vi.fn(async (a: string, b: number) => {
      expect(a).toBe("test");
      expect(b).toBe(42);
    });
    const wrappedHandler = withErrorHints(handler);

    await wrappedHandler("test", 42);

    expect(handler).toHaveBeenCalledWith("test", 42);
  });

  it("should add hint to milestone missing error", async () => {
    const handler = vi.fn(async () => {
      throw new Error("milestone does not exist");
    });
    const wrappedHandler = withErrorHints(handler);

    await wrappedHandler();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "ERROR:",
      expect.stringContaining("milestone does not exist"),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "ERROR:",
      expect.stringContaining("pa milestone new"),
    );
  });
});

describe("formatErrorWithHint", () => {
  it("sanitizes escape characters from error output", () => {
    const output = formatErrorWithHint(new Error("phase not found\x1b[31m"));
    expect(output).toContain("phase not found");
    expect(output).not.toContain("\x1b");
  });

  it("supports optional stack output in debug mode", () => {
    const previous = process.env.PA_DEBUG;
    process.env.PA_DEBUG = "1";
    const error = new Error("boom");
    const output = formatErrorWithHint(error, { includeStack: true });
    expect(output).toContain("Error: boom");
    process.env.PA_DEBUG = previous;
  });
});
