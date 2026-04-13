import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-lifecycle-command-shell-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-lifecycle-command-shell-composition.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-lifecycle-command-shell-composition.mjs", content);
}

async function seedMinimalShellBoundary(root) {
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
    [
      'export const RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH = "apps/project-arch-extension/src/navigation/experimentalArtifactBrowser";',
      'export const LIFECYCLE_SHELL_SURFACE_ID = "lifecycle";',
      'export const COMMANDS_SHELL_SURFACE_ID = "commands";',
      "export const LIFECYCLE_SHELL_PANE_ID = LIFECYCLE_SHELL_SURFACE_ID;",
      "export const COMMANDS_SHELL_PANE_ID = COMMANDS_SHELL_SURFACE_ID;",
      "",
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
    [
      'import { LIFECYCLE_SHELL_SURFACE_ID, COMMANDS_SHELL_SURFACE_ID } from "./surfaceMigrationBoundary";',
      "export const artifactBrowserShellNavigationItems = [",
      "  { id: LIFECYCLE_SHELL_SURFACE_ID, label: \"Lifecycle\" },",
      "  { id: COMMANDS_SHELL_SURFACE_ID, label: \"Commands\" },",
      "];",
      "",
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/navigation/lifecycleView.ts",
    [
      'import { LIFECYCLE_SHELL_SURFACE_ID, LIFECYCLE_SHELL_PANE_ID, RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
      "export function renderLifecycleHtml(){",
      "  return `<div class=\"pa-shell-layout\" data-pa-shell-surface=\"${LIFECYCLE_SHELL_SURFACE_ID}\"><header class=\"pa-shell-region-header\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</header><main class=\"pa-shell-region-main\"><div data-pa-shell-pane=\"${LIFECYCLE_SHELL_PANE_ID}\"></div></main></div>`;",
      "}",
      "",
    ].join("\n"),
  );

  await writeFile(
    root,
    "src/navigation/commandCatalogView.ts",
    [
      'import { COMMANDS_SHELL_SURFACE_ID, COMMANDS_SHELL_PANE_ID, RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
      "export function renderCommandCatalogHtml(){",
      "  return `<div class=\"pa-shell-layout\" data-pa-shell-surface=\"${COMMANDS_SHELL_SURFACE_ID}\"><header class=\"pa-shell-region-header\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</header><main class=\"pa-shell-region-main\"><div data-pa-shell-pane=\"${COMMANDS_SHELL_PANE_ID}\"></div></main></div>`;",
      "}",
      "",
    ].join("\n"),
  );
}

function runValidationScript(root) {
  const scriptPath = path.join(root, "scripts/validate-lifecycle-command-shell-composition.mjs");
  return spawnSync("node", [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-lifecycle-command-shell-composition", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal lifecycle/command shared-shell composition boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("composition checks passed");
  });

  it("fails when lifecycle view no longer declares shared shell marker constant", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(
      root,
      "src/navigation/lifecycleView.ts",
      [
        'import { RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
        "export function renderLifecycleHtml(){",
        "  return `<div class=\"pa-shell-layout\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</div>`;",
        "}",
        "",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lifecycle shared shell surface marker constant");
  });

  it("fails when command view no longer declares shell pane marker constant", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(
      root,
      "src/navigation/commandCatalogView.ts",
      [
        'import { COMMANDS_SHELL_SURFACE_ID, RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH } from "./experimentalArtifactBrowser/client/surfaceMigrationBoundary";',
        "export function renderCommandCatalogHtml(){",
        "  return `<div class=\"pa-shell-layout\" data-pa-shell-surface=\"${COMMANDS_SHELL_SURFACE_ID}\"><header class=\"pa-shell-region-header\">${RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH}</header><main class=\"pa-shell-region-main\"></main></div>`;",
        "}",
        "",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("commands shell pane marker constant");
  });

  it("fails when shell config reintroduces lifecycle/commands pending placeholders", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
      [
        'import { LIFECYCLE_SHELL_SURFACE_ID, COMMANDS_SHELL_SURFACE_ID } from "./surfaceMigrationBoundary";',
        "export const artifactBrowserShellNavigationItems = [",
        "  { id: LIFECYCLE_SHELL_SURFACE_ID, label: \"Lifecycle\" },",
        "  { id: COMMANDS_SHELL_SURFACE_ID, label: \"Commands\" },",
        "];",
        'export const regressionCopy = "Lifecycle (Pending Migration) / Commands (Pending Migration)";',
        "",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lifecycle pending migration placeholder copy");
  });
});
