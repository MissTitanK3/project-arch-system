import { describe, it, expect } from "vitest";
import * as fsIndex from "./index";

describe("fs/index", () => {
  it("re-exports filesystem helpers", () => {
    expect(typeof fsIndex.ensureDir).toBe("function");
    expect(typeof fsIndex.writeFile).toBe("function");
    expect(typeof fsIndex.readProject).toBe("function");
    expect(typeof fsIndex.pathExists).toBe("function");
    expect(typeof fsIndex.readJson).toBe("function");
    expect(typeof fsIndex.readMarkdownWithFrontmatter).toBe("function");
    expect(typeof fsIndex.writeJsonDeterministic).toBe("function");
    expect(typeof fsIndex.writeMarkdownWithFrontmatter).toBe("function");
  });
});
