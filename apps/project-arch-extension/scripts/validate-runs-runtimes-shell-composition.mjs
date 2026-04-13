import { promises as fs } from "node:fs";
import path from "node:path";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[runs-runtimes-shell-validate] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[runs-runtimes-shell-validate] Missing ${label}: ${fragment}`);
  }
}

function ensureNotContains(content, fragment, label) {
  if (content.includes(fragment)) {
    throw new Error(`[runs-runtimes-shell-validate] Unexpected ${label}: ${fragment}`);
  }
}

async function validateExperimentalBoundaryDefinition() {
  const migrationBoundary = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
  );
  const shellConfig = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
  );

  ensureContains(
    migrationBoundary,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "runs/runtimes migration boundary constant",
  );
  ensureContains(
    migrationBoundary,
    "RUNS_SHELL_SURFACE_ID",
    "runs shell surface ID constant",
  );
  ensureContains(
    migrationBoundary,
    "RUNTIMES_SHELL_SURFACE_ID",
    "runtimes shell surface ID constant",
  );
  ensureContains(
    shellConfig,
    "RUNS_SHELL_SURFACE_ID",
    "runs shell slot anchored to migration boundary constants",
  );
  ensureContains(
    shellConfig,
    "RUNTIMES_SHELL_SURFACE_ID",
    "runtimes shell slot anchored to migration boundary constants",
  );
  ensureNotContains(
    shellConfig,
    "Runs (Pending Migration)",
    "runs pending migration placeholder copy",
  );
  ensureNotContains(
    shellConfig,
    "Runtimes (Pending Migration)",
    "runtimes pending migration placeholder copy",
  );
}

async function validateRunsSourceBoundary() {
  const runsView = await readRequiredFile("src/navigation/runsView.ts");

  ensureContains(
    runsView,
    "surfaceMigrationBoundary",
    "runs migration boundary import path",
  );
  ensureContains(runsView, "RUNS_SHELL_SURFACE_ID", "runs shared shell surface marker constant");
  ensureContains(runsView, 'pa-shell-layout', "runs shared shell layout class");
  ensureContains(runsView, 'pa-shell-region-header', "runs shell header region");
  ensureContains(runsView, 'pa-shell-region-main', "runs shell main region");
  ensureContains(runsView, "RUNS_SHELL_PANE_ID", "runs shell pane marker constant");
  ensureContains(
    runsView,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "runs migration boundary metadata",
  );
  ensureContains(runsView, 'renderRunsHtml', "runs render entrypoint");

  ensureNotContains(
    runsView,
    'import { ShellLayout',
    "runs view directly importing Preact shell runtime in host-only view",
  );
}

async function validateRuntimesSourceBoundary() {
  const runtimesView = await readRequiredFile("src/navigation/runtimesView.ts");

  ensureContains(
    runtimesView,
    "surfaceMigrationBoundary",
    "runtimes migration boundary import path",
  );
  ensureContains(
    runtimesView,
    "RUNTIMES_SHELL_SURFACE_ID",
    "runtimes shared shell surface marker constant",
  );
  ensureContains(runtimesView, 'pa-shell-layout', "runtimes shared shell layout class");
  ensureContains(runtimesView, 'pa-shell-region-header', "runtimes shell header region");
  ensureContains(runtimesView, 'pa-shell-region-main', "runtimes shell main region");
  ensureContains(runtimesView, "RUNTIMES_SHELL_PANE_ID", "runtimes shell pane marker constant");
  ensureContains(
    runtimesView,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "runtimes migration boundary metadata",
  );
  ensureContains(runtimesView, 'renderRuntimesHtml', "runtimes render entrypoint");

  ensureNotContains(
    runtimesView,
    'import { ShellLayout',
    "runtimes view directly importing Preact shell runtime in host-only view",
  );
}

async function main() {
  await validateExperimentalBoundaryDefinition();
  await validateRunsSourceBoundary();
  await validateRuntimesSourceBoundary();

  process.stdout.write(
    "[runs-runtimes-shell-validate] runs and runtimes shell composition checks passed\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
