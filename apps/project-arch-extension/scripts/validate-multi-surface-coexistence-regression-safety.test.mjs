import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-multi-surface-coexistence-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-multi-surface-coexistence-regression-safety.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-multi-surface-coexistence-regression-safety.mjs", content);
}

async function seedMinimalBoundary(root) {
  await writeFile(
    root,
    "package.json",
    [
      '"verify:runs-runtimes-shell-composition"',
      '"verify:lifecycle-command-shell-composition"',
      '"verify:shared-navigation-guidance-integration"',
      '"verify:multi-surface-coexistence-regression-safety"',
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/activation.test.ts",
    [
      "EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID",
      "RUNS_VIEW_ID",
      "RUNTIMES_VIEW_ID",
      "LIFECYCLE_VIEW_ID",
      "COMMAND_CATALOG_VIEW_ID",
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/navigation/artifactNavigationManifest.test.ts",
    "retains dedicated non-migrated surfaces\n",
  );

  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
    [
      "Runs Guidance",
      "Runtimes Guidance",
      "Lifecycle Guidance",
      "Commands Guidance",
      "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
    [
      "handleSelectSurface",
      "shellState.isGuidanceRailOpen",
      "createArtifactBrowserSurfaceGuidancePayload(nextSurface)",
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
    [
      "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
      "RUNS_SHELL_SURFACE_ID",
      "RUNTIMES_SHELL_SURFACE_ID",
      "LIFECYCLE_SHELL_SURFACE_ID",
      "COMMANDS_SHELL_SURFACE_ID",
    ].join("\n"),
  );
}

function runValidationScript(root, { withBuildOutput = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-multi-surface-coexistence-regression-safety.mjs");
  const args = withBuildOutput ? [scriptPath, "--with-build-output"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-multi-surface-coexistence-regression-safety", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal multi-surface coexistence boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("regression checks passed");
  });

  it("fails when shared shell config drops lifecycle guidance payload", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
      ["Runs Guidance", "Runtimes Guidance", "Commands Guidance"].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lifecycle guidance payload coverage");
  });

  it("fails build-output mode when built boundary marker is missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalBoundary(root);
    await writeFile(
      root,
      "dist/webviews/experimental-artifact-browser/client.js",
      "Runs Guidance Runtimes Guidance Lifecycle Guidance Commands Guidance\n",
    );

    const result = runValidationScript(root, { withBuildOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("built runtime migration boundary marker");
  });
});
