import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSandboxInitArgs, resolveRepoRoot, verifyProfile } from "./sandbox-init.mjs";

const tempDirs = [];

function createTempSandbox() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-sandbox-init-test-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function writeFile(tempDir, relativePath, content = "ok\n") {
  const targetPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

function seedDefaultProfileBase(tempDir) {
  writeFile(tempDir, "architecture/governance/init-default-behavior.md");
  writeFile(tempDir, "architecture/governance/REPO-MODEL.md");
  writeFile(tempDir, "architecture/governance/module-model.md");
  writeFile(tempDir, "architecture/metadata/domains/domains.json", "{}\n");
  writeFile(tempDir, "roadmap/projects/shared/manifest.json", "{}\n");
  writeFile(tempDir, "roadmap/projects/shared/phases/phase-1/overview.md");
  writeFile(
    tempDir,
    "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe("sandbox-init arg parsing", () => {
  it("parses profile and forwards init args distinctly", () => {
    expect(
      parseSandboxInitArgs(["node", "scripts/sandbox-init.mjs", "default", "--with-workflows"]),
    ).toEqual({
      profile: "default",
      initArgs: ["--with-workflows"],
    });
  });

  it("defaults profile to default when no profile argument is provided", () => {
    expect(parseSandboxInitArgs(["node", "scripts/sandbox-init.mjs"])).toEqual({
      profile: "default",
      initArgs: [],
    });
  });

  it("treats a leading flag as init args and keeps default profile", () => {
    expect(parseSandboxInitArgs(["node", "scripts/sandbox-init.mjs", "--mono", "--with-workflows"])).toEqual({
      profile: "default",
      initArgs: ["--mono", "--with-workflows"],
    });
  });
});

describe("sandbox-init repo root resolution", () => {
  it("resolves repo root by walking upward from a nested path", () => {
    const repoRoot = createTempSandbox();
    const nestedPath = path.join(repoRoot, "packages", "project-arch", "src", "cli", "commands");
    fs.mkdirSync(nestedPath, { recursive: true });
    writeFile(repoRoot, "pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    writeFile(repoRoot, "packages/project-arch/package.json", "{}\n");

    expect(resolveRepoRoot([nestedPath])).toBe(repoRoot);
  });

  it("throws a clear error when no repository markers are found", () => {
    const tempDir = createTempSandbox();

    expect(() => resolveRepoRoot([tempDir])).toThrow(/Unable to resolve repository root/i);
  });
});

describe("sandbox-init profile verification", () => {
  it("allows default profile without workflow files when workflow generation is not requested", () => {
    const tempDir = createTempSandbox();
    seedDefaultProfileBase(tempDir);

    expect(() => verifyProfile("default", tempDir, [])).not.toThrow();
  });

  it("requires generated workflow files when workflow generation is requested", () => {
    const tempDir = createTempSandbox();
    seedDefaultProfileBase(tempDir);
    writeFile(tempDir, ".project-arch/workflows/before-coding.workflow.md");
    writeFile(tempDir, ".project-arch/workflows/after-coding.workflow.md");
    writeFile(tempDir, ".project-arch/workflows/complete-task.workflow.md");
    writeFile(tempDir, ".project-arch/workflows/new-module.workflow.md");
    writeFile(tempDir, ".project-arch/workflows/diagnose.workflow.md");

    expect(() => verifyProfile("default", tempDir, ["--with-workflows"])).not.toThrow();
  });

  it("fails workflow-enabled verification when generated workflow files are missing", () => {
    const tempDir = createTempSandbox();
    seedDefaultProfileBase(tempDir);

    expect(() => verifyProfile("default", tempDir, ["--with-workflows"])).toThrow(
      "Expected file to exist for profile 'default': .project-arch/workflows/before-coding.workflow.md",
    );
  });

  it("fails when default profile is missing required architecture support artifacts", () => {
    const tempDir = createTempSandbox();
    seedDefaultProfileBase(tempDir);
    fs.rmSync(path.join(tempDir, "architecture", "metadata", "domains", "domains.json"));

    expect(() => verifyProfile("default", tempDir, [])).toThrow(
      "Expected file to exist for profile 'default': architecture/metadata/domains/domains.json",
    );
  });
});
