import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSandboxInitArgs, verifyProfile } from "./sandbox-init.mjs";

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
});
