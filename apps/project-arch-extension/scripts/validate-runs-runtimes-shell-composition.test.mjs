import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-runs-runtimes-shell-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-runs-runtimes-shell-composition.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-runs-runtimes-shell-composition.mjs", content);
}

async function seedMinimalShellBoundary(root) {
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
    [
      'export const RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH = "apps/project-arch-extension/src/navigation/experimentalArtifactBrowser";',
      'export const RUNS_SHELL_SURFACE_ID = "runs";',
      'export const RUNTIMES_SHELL_SURFACE_ID = "runtimes";',
      "export const RUNS_SHELL_PANE_ID = RUNS_SHELL_SURFACE_ID;",
      "export const RUNTIMES_SHELL_PANE_ID = RUNTIMES_SHELL_SURFACE_ID;",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
    [
      'import { RUNS_SHELL_SURFACE_ID, RUNTIMES_SHELL_SURFACE_ID } from "./surfaceMigrationBoundary";',
      "export const artifactBrowserShellNavigationItems = [",
      "  { id: RUNS_SHELL_SURFACE_ID, label: \"Runs\" },",
      "  { id: RUNTIMES_SHELL_SURFACE_ID, label: \"Runtimes\" },",
      "];",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/runsView.ts",
    [
      'import { RUNS_SHELL_SURFACE_ID, RUNS_SHELL_PANE_ID, RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
      "export function renderRunsHtml(){",
      "  return `<div class=\"pa-shell-layout\" data-pa-shell-surface=\"${RUNS_SHELL_SURFACE_ID}\"><header class=\"pa-shell-region-header\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</header><main class=\"pa-shell-region-main\"><div data-pa-shell-pane=\"${RUNS_SHELL_PANE_ID}\"></div></main></div>`;",
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/runtimesView.ts",
    [
      'import { RUNTIMES_SHELL_SURFACE_ID, RUNTIMES_SHELL_PANE_ID, RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
      "export function renderRuntimesHtml(){",
      "  return `<div class=\"pa-shell-layout\" data-pa-shell-surface=\"${RUNTIMES_SHELL_SURFACE_ID}\"><header class=\"pa-shell-region-header\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</header><main class=\"pa-shell-region-main\"><div data-pa-shell-pane=\"${RUNTIMES_SHELL_PANE_ID}\"></div></main></div>`;",
      "}",
      "",
    ].join("\n"),
  );
}

function runValidationScript(root) {
  const scriptPath = path.join(root, "scripts/validate-runs-runtimes-shell-composition.mjs");
  return spawnSync("node", [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-runs-runtimes-shell-composition", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal runs/runtimes shared-shell composition boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("composition checks passed");
  });

  it("fails when runs view no longer declares shared shell marker", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(
      root,
      "src/navigation/runsView.ts",
      [
        'import { RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
        "export function renderRunsHtml(){",
        "  return `<div class=\"pa-shell-layout\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</div>`;",
        "}",
        "",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("runs shared shell surface marker");
  });

  it("fails when runtimes view no longer declares shell pane marker", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(
      root,
      "src/navigation/runtimesView.ts",
      [
        'import { RUNTIMES_SHELL_SURFACE_ID, RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
        "export function renderRuntimesHtml(){",
        "  return `<div class=\"pa-shell-layout\" data-pa-shell-surface=\"${RUNTIMES_SHELL_SURFACE_ID}\"><header class=\"pa-shell-region-header\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</header><main class=\"pa-shell-region-main\"></main></div>`;",
        "}",
        "",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("runtimes shell pane marker constant");
  });

  it("fails when shell config reintroduces runs/runtimes pending placeholders", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
      [
        'import { RUNS_SHELL_SURFACE_ID, RUNTIMES_SHELL_SURFACE_ID } from "./surfaceMigrationBoundary";',
        "export const artifactBrowserShellNavigationItems = [",
        "  { id: RUNS_SHELL_SURFACE_ID, label: \"Runs\" },",
        "  { id: RUNTIMES_SHELL_SURFACE_ID, label: \"Runtimes\" },",
        "];",
        'export const regressionCopy = "Runs (Pending Migration) / Runtimes (Pending Migration)";',
        "",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("runs pending migration placeholder copy");
  });
});
