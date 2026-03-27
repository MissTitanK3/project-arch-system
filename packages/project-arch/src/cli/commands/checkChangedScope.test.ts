import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { ensureDir, mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import path from "path";
import { buildChangedScopePaths, detectChangedPaths } from "./checkChangedScope";

function runGit(args: string[], cwd: string): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || `git ${args.join(" ")} failed`);
  }
}

describe("cli/commands/checkChangedScope", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "pa-check-scope-"));
  });

  afterEach(() => {
    return rm(tempDir, { recursive: true, force: true });
  });

  it("detectChangedPaths returns stderr reason for non-git directories", () => {
    const result = detectChangedPaths(tempDir);
    expect(result.ok).toBe(false);
    expect(result.paths).toEqual([]);
    expect(result.reason).toContain("git");
  });

  it("detectChangedPaths handles clean repositories", async () => {
    runGit(["init"], tempDir);
    runGit(["config", "user.email", "test@example.com"], tempDir);
    runGit(["config", "user.name", "test"], tempDir);

    const result = detectChangedPaths(tempDir);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual([]);
  });

  it("detectChangedPaths parses modified, untracked, and rename entries", async () => {
    runGit(["init"], tempDir);
    runGit(["config", "user.email", "test@example.com"], tempDir);
    runGit(["config", "user.name", "test"], tempDir);

    const oldPath = path.join(tempDir, "src", "old.ts");
    const manifestPath = path.join(tempDir, "roadmap", "manifest.json");
    const untrackedPath = path.join(tempDir, "new-untracked.ts");

    await ensureDir(path.dirname(oldPath));
    await ensureDir(path.dirname(manifestPath));
    await writeFile(oldPath, "export const oldValue = 1;\n", "utf8");
    await writeFile(manifestPath, '{"schemaVersion":"1.0"}\n', "utf8");

    runGit(["add", "."], tempDir);
    runGit(["commit", "-m", "seed"], tempDir);

    runGit(["mv", "src/old.ts", "src/new.ts"], tempDir);
    await writeFile(manifestPath, '{"schemaVersion":"1.1"}\n', "utf8");
    await writeFile(untrackedPath, "export const added = true;\n", "utf8");

    const result = detectChangedPaths(tempDir);
    expect(result.ok).toBe(true);
    expect(result.paths).toEqual(
      expect.arrayContaining([
        "roadmap/manifest.json",
        "src/old.ts",
        "src/new.ts",
        "new-untracked.ts",
      ]),
    );
  });

  it("buildChangedScopePaths normalizes input and appends required scope paths", () => {
    const result = buildChangedScopePaths([
      " ./roadmap/manifest.json ",
      "src\\feature\\index.ts",
      "",
    ]);

    expect(result).toEqual(
      expect.arrayContaining(["roadmap/manifest.json", "src/feature/index.ts"]),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        "arch-model/modules.json",
        "arch-domains/domains.json",
        ".project-arch/graph.config.json",
        ".project-arch/reconcile.config.json",
        ".arch/**",
      ]),
    );
  });
});
