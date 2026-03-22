import { describe, it, expect } from "vitest";
import { assertSafeId } from "./safeId";

describe("assertSafeId", () => {
  describe("valid ids", () => {
    const valid = [
      "a",
      "z",
      "0",
      "phase-1",
      "m1",
      "milestone-1-setup",
      "my-phase",
      "long-multi-part-id",
      "phase-99",
      "abc123",
      "milestone-with-dashes-123",
    ];

    for (const id of valid) {
      it(`accepts "${id}"`, () => {
        expect(() => assertSafeId(id, "phaseId")).not.toThrow();
      });
    }
  });

  describe("rejected ids", () => {
    const invalid: Array<{ id: string; reason: string }> = [
      { id: "", reason: "empty string" },
      { id: "../evil", reason: "path traversal with .." },
      { id: "../../etc/passwd", reason: "deep path traversal" },
      { id: "/abs/path", reason: "absolute path" },
      { id: "has spaces", reason: "contains spaces" },
      { id: "UPPER", reason: "uppercase letters" },
      { id: "Mixed-Case", reason: "mixed case" },
      { id: "a--b", reason: "double hyphen" },
      { id: "a-", reason: "trailing hyphen" },
      { id: "-a", reason: "leading hyphen" },
      { id: "a.b", reason: "dot separator" },
      { id: "a/b", reason: "forward slash" },
      { id: "a\\b", reason: "backslash" },
      { id: "\x00null", reason: "null byte" },
      { id: "a b", reason: "internal space" },
    ];

    for (const { id, reason } of invalid) {
      it(`rejects "${id}" (${reason})`, () => {
        expect(() => assertSafeId(id, "phaseId")).toThrow(/^phaseId must match \^\[a-z0-9\]/);
      });
    }
  });

  it("includes the label in the error message", () => {
    expect(() => assertSafeId("INVALID", "milestoneId")).toThrow(/^milestoneId must match/);
  });

  it("includes the offending value in the error message", () => {
    expect(() => assertSafeId("../evil", "phaseId")).toThrow(/"\.\.\/evil"/);
  });
});
