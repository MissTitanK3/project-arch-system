import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-shared-nav-guidance-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-shared-navigation-guidance-integration.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-shared-navigation-guidance-integration.mjs", content);
}

async function seedMinimalBoundary(root) {
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
    'export const RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH = "apps/project-arch-extension/src/navigation/experimentalArtifactBrowser";\n',
  );

  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
    [
      "RUNS_SHELL_SURFACE_ID",
      "RUNTIMES_SHELL_SURFACE_ID",
      "LIFECYCLE_SHELL_SURFACE_ID",
      "COMMANDS_SHELL_SURFACE_ID",
      "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
      "Runs Guidance",
      "Runtimes Guidance",
      "Lifecycle Guidance",
      "Commands Guidance",
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
    [
      "const handleSelectSurface = () => {};",
      "if (shellState.isGuidanceRailOpen) {}",
      "createArtifactBrowserSurfaceGuidancePayload(nextSurface);",
      "onOpenGuidance={() => shellActions.openGuidance(surfaceGuidancePayload)}",
    ].join("\n"),
  );
}

function runValidationScript(root, { withBuildOutput = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-shared-navigation-guidance-integration.mjs");
  const args = withBuildOutput ? [scriptPath, "--with-build-output"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-shared-navigation-guidance-integration", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal shared navigation/guidance integration boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("integration checks passed");
  });

  it("fails when shell config drops commands guidance payload", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
      [
        "RUNS_SHELL_SURFACE_ID",
        "RUNTIMES_SHELL_SURFACE_ID",
        "LIFECYCLE_SHELL_SURFACE_ID",
        "COMMANDS_SHELL_SURFACE_ID",
        "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
        "Runs Guidance",
        "Runtimes Guidance",
        "Lifecycle Guidance",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("commands contextual guidance payload");
  });

  it("fails build-output mode when built guidance labels are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalBoundary(root);
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js", "missing-guidance-labels\n");

    const result = runValidationScript(root, { withBuildOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("built runs contextual guidance copy");
  });
});
