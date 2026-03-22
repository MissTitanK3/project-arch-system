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
    expect(typeof fsIndex.writeJsonDeterministicIfChanged).toBe("function");
    expect(typeof fsIndex.writeMarkdownWithFrontmatter).toBe("function");
  });

  it("exposes stable top-level export keys", () => {
    const keys = Object.keys(fsIndex);
    expect(keys).toEqual(
      expect.arrayContaining([
        "ensureDir",
        "writeFile",
        "readProject",
        "pathExists",
        "readJson",
        "readMarkdownWithFrontmatter",
        "writeJsonDeterministic",
        "writeJsonDeterministicIfChanged",
        "writeMarkdownWithFrontmatter",
      ]),
    );
  });
});
