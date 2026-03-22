import { describe, expect, it } from "vitest";
import {
  escapeMarkdownTableCell,
  escapeMarkdownText,
  sanitizeFrontmatterString,
  sanitizeFrontmatterValue,
  sanitizeMarkdownHeading,
  sanitizeMarkdownLinkTarget,
} from "./markdownSafety";

describe("utils/markdownSafety", () => {
  it("sanitizes frontmatter strings by stripping control characters", () => {
    const value = "Title\x1b[31m\n\tInjected";
    expect(sanitizeFrontmatterString(value)).toBe("Title Injected");
  });

  it("sanitizes frontmatter object values recursively", () => {
    const input = {
      title: "Safe\x00Title",
      nested: { summary: "A\x1b[31m" },
      tags: ["a\x07", "b"],
    };
    expect(sanitizeFrontmatterValue(input)).toEqual({
      title: "SafeTitle",
      nested: { summary: "A" },
      tags: ["a", "b"],
    });
  });

  it("escapes markdown heading text", () => {
    expect(sanitizeMarkdownHeading("## hello | world")).toBe("hello \\| world");
  });

  it("escapes markdown body text", () => {
    expect(escapeMarkdownText("a*b_[x]")).toBe("a\\*b\\_\\[x\\]");
  });

  it("escapes markdown table cells and normalizes newlines", () => {
    expect(escapeMarkdownTableCell("a|b\nnext")).toBe("a\\|b <br> next");
  });

  it("sanitizes markdown link targets", () => {
    expect(sanitizeMarkdownLinkTarget("docs/My File.md\x1b[31m")).toBe("docs/My%20File.md");
  });
});
