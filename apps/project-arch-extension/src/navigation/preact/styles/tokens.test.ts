import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readTokensCss(): string {
  return readFileSync(path.join(__dirname, "tokens.css"), "utf8");
}

describe("shared shell styling tokens", () => {
  it("defines reusable shell/component visual tokens", () => {
    const css = readTokensCss();

    expect(css).toContain("--pa-space-4");
    expect(css).toContain("--pa-color-bg");
    expect(css).toContain("--pa-color-border");
    expect(css).toContain("--pa-color-button-bg");
  });

  it("provides explicit shell and primitive boundary selectors", () => {
    const css = readTokensCss();

    expect(css).toContain(".pa-shell-layout");
    expect(css).toContain(".pa-shell-navigation-frame");
    expect(css).toContain(".pa-shell-sheet");
    expect(css).toContain(".pa-shell-region-header");
    expect(css).toContain(".pa-section");
    expect(css).toContain(".pa-section-title");
    expect(css).toContain(".pa-code-text");
  });
});
