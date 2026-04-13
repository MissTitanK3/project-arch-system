import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[lifecycle-command-shell-validate] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[lifecycle-command-shell-validate] Missing ${label}: ${fragment}`);
  }
}

function ensureNotContains(content, fragment, label) {
  if (content.includes(fragment)) {
    throw new Error(`[lifecycle-command-shell-validate] Unexpected ${label}: ${fragment}`);
  }
}

async function validateMigrationBoundaryDefinitions() {
  const migrationBoundary = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
  );
  const shellConfig = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
  );

  ensureContains(
    migrationBoundary,
    "LIFECYCLE_SHELL_SURFACE_ID",
    "lifecycle shell surface ID constant",
  );
  ensureContains(
    migrationBoundary,
    "COMMANDS_SHELL_SURFACE_ID",
    "commands shell surface ID constant",
  );
  ensureContains(
    migrationBoundary,
    "LIFECYCLE_SHELL_PANE_ID",
    "lifecycle shell pane ID constant",
  );
  ensureContains(
    migrationBoundary,
    "COMMANDS_SHELL_PANE_ID",
    "commands shell pane ID constant",
  );

  ensureContains(
    shellConfig,
    "LIFECYCLE_SHELL_SURFACE_ID",
    "lifecycle slot anchored to migration boundary constants",
  );
  ensureContains(
    shellConfig,
    "COMMANDS_SHELL_SURFACE_ID",
    "commands slot anchored to migration boundary constants",
  );
  ensureNotContains(
    shellConfig,
    "Lifecycle (Pending Migration)",
    "lifecycle pending migration placeholder copy",
  );
  ensureNotContains(
    shellConfig,
    "Commands (Pending Migration)",
    "commands pending migration placeholder copy",
  );
}

async function validateLifecycleSourceBoundary() {
  const lifecycleView = await readRequiredFile("src/navigation/lifecycleView.ts");

  ensureContains(
    lifecycleView,
    "surfaceMigrationBoundary",
    "lifecycle migration boundary import path",
  );
  ensureContains(
    lifecycleView,
    "LIFECYCLE_SHELL_SURFACE_ID",
    "lifecycle shared shell surface marker constant",
  );
  ensureContains(lifecycleView, "pa-shell-layout", "lifecycle shared shell layout class");
  ensureContains(lifecycleView, "pa-shell-region-header", "lifecycle shell header region");
  ensureContains(lifecycleView, "pa-shell-region-main", "lifecycle shell main region");
  ensureContains(
    lifecycleView,
    "LIFECYCLE_SHELL_PANE_ID",
    "lifecycle shell pane marker constant",
  );
  ensureContains(
    lifecycleView,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "lifecycle migration boundary metadata",
  );
  ensureContains(lifecycleView, "renderLifecycleHtml", "lifecycle render entrypoint");

  ensureNotContains(
    lifecycleView,
    "import { ShellLayout",
    "lifecycle view directly importing Preact shell runtime in host-only view",
  );
}

async function validateCommandCatalogSourceBoundary() {
  const commandCatalogView = await readRequiredFile("src/navigation/commandCatalogView.ts");

  ensureContains(
    commandCatalogView,
    "surfaceMigrationBoundary",
    "commands migration boundary import path",
  );
  ensureContains(
    commandCatalogView,
    "COMMANDS_SHELL_SURFACE_ID",
    "commands shared shell surface marker constant",
  );
  ensureContains(
    commandCatalogView,
    "pa-shell-layout",
    "commands shared shell layout class",
  );
  ensureContains(
    commandCatalogView,
    "pa-shell-region-header",
    "commands shell header region",
  );
  ensureContains(commandCatalogView, "pa-shell-region-main", "commands shell main region");
  ensureContains(
    commandCatalogView,
    "COMMANDS_SHELL_PANE_ID",
    "commands shell pane marker constant",
  );
  ensureContains(
    commandCatalogView,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "commands migration boundary metadata",
  );
  ensureContains(
    commandCatalogView,
    "renderCommandCatalogHtml",
    "commands render entrypoint",
  );

  ensureNotContains(
    commandCatalogView,
    "import { ShellLayout",
    "commands view directly importing Preact shell runtime in host-only view",
  );
}

async function main() {
  await validateMigrationBoundaryDefinitions();
  await validateLifecycleSourceBoundary();
  await validateCommandCatalogSourceBoundary();

  process.stdout.write(
    "[lifecycle-command-shell-validate] lifecycle and command shell composition checks passed\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
