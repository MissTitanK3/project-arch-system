import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[multi-surface-coexistence-validate] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[multi-surface-coexistence-validate] Missing ${label}: ${fragment}`);
  }
}

async function validateSourceCoverageBoundary() {
  const packageJson = await readRequiredFile("package.json");
  const activationTest = await readRequiredFile("src/activation.test.ts");
  const manifestTest = await readRequiredFile("src/navigation/artifactNavigationManifest.test.ts");
  const shellConfig = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
  );
  const shellApp = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
  );
  const migrationBoundary = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
  );

  ensureContains(
    packageJson,
    '"verify:runs-runtimes-shell-composition"',
    "runs/runtimes migration verification command",
  );
  ensureContains(
    packageJson,
    '"verify:lifecycle-command-shell-composition"',
    "lifecycle/command migration verification command",
  );
  ensureContains(
    packageJson,
    '"verify:shared-navigation-guidance-integration"',
    "shared navigation/guidance verification command",
  );
  ensureContains(
    packageJson,
    '"verify:multi-surface-coexistence-regression-safety"',
    "multi-surface coexistence regression verification command",
  );

  ensureContains(
    activationTest,
    "EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID",
    "experimental shell activation coverage",
  );
  ensureContains(activationTest, "RUNS_VIEW_ID", "runs activation coverage");
  ensureContains(activationTest, "RUNTIMES_VIEW_ID", "runtimes activation coverage");
  ensureContains(activationTest, "LIFECYCLE_VIEW_ID", "lifecycle activation coverage");
  ensureContains(activationTest, "COMMAND_CATALOG_VIEW_ID", "command activation coverage");

  ensureContains(
    manifestTest,
    "retains dedicated non-migrated surfaces",
    "manifest coexistence regression coverage",
  );

  ensureContains(shellConfig, "Runs Guidance", "runs guidance payload coverage");
  ensureContains(shellConfig, "Runtimes Guidance", "runtimes guidance payload coverage");
  ensureContains(shellConfig, "Lifecycle Guidance", "lifecycle guidance payload coverage");
  ensureContains(shellConfig, "Commands Guidance", "commands guidance payload coverage");
  ensureContains(
    shellConfig,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "runtime migration boundary usage in shell config",
  );

  ensureContains(shellApp, "handleSelectSurface", "cross-surface navigation transition handling");
  ensureContains(shellApp, "shellState.isGuidanceRailOpen", "shared guidance rail state transitions");
  ensureContains(
    shellApp,
    "createArtifactBrowserSurfaceGuidancePayload(nextSurface)",
    "cross-surface guidance payload refresh",
  );

  ensureContains(
    migrationBoundary,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "runtime migration boundary constant",
  );
  ensureContains(migrationBoundary, "RUNS_SHELL_SURFACE_ID", "runs boundary constant");
  ensureContains(migrationBoundary, "RUNTIMES_SHELL_SURFACE_ID", "runtimes boundary constant");
  ensureContains(migrationBoundary, "LIFECYCLE_SHELL_SURFACE_ID", "lifecycle boundary constant");
  ensureContains(migrationBoundary, "COMMANDS_SHELL_SURFACE_ID", "commands boundary constant");
}

async function validateBuiltCoverageBoundary() {
  const builtJs = await readRequiredFile("dist/webviews/experimental-artifact-browser/client.js");

  ensureContains(builtJs, "Runs Guidance", "built runs guidance marker");
  ensureContains(builtJs, "Runtimes Guidance", "built runtimes guidance marker");
  ensureContains(builtJs, "Lifecycle Guidance", "built lifecycle guidance marker");
  ensureContains(builtJs, "Commands Guidance", "built commands guidance marker");
  ensureContains(
    builtJs,
    "apps/project-arch-extension/src/navigation/experimentalArtifactBrowser",
    "built runtime migration boundary marker",
  );
}

async function main() {
  await validateSourceCoverageBoundary();

  if (process.argv.includes("--with-build-output")) {
    await validateBuiltCoverageBoundary();
  }

  process.stdout.write(
    "[multi-surface-coexistence-validate] multi-surface coexistence regression checks passed\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
