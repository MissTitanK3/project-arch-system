import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[shared-navigation-guidance-validate] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[shared-navigation-guidance-validate] Missing ${label}: ${fragment}`);
  }
}

async function validateSourceBoundary() {
  const shellConfig = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
  );
  const app = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
  );
  const migrationBoundary = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/surfaceMigrationBoundary.ts",
  );

  ensureContains(shellConfig, "RUNS_SHELL_SURFACE_ID", "runs shell navigation ID wiring");
  ensureContains(shellConfig, "RUNTIMES_SHELL_SURFACE_ID", "runtimes shell navigation ID wiring");
  ensureContains(shellConfig, "LIFECYCLE_SHELL_SURFACE_ID", "lifecycle shell navigation ID wiring");
  ensureContains(shellConfig, "COMMANDS_SHELL_SURFACE_ID", "commands shell navigation ID wiring");
  ensureContains(shellConfig, "Runs Guidance", "runs contextual guidance payload");
  ensureContains(shellConfig, "Runtimes Guidance", "runtimes contextual guidance payload");
  ensureContains(shellConfig, "Lifecycle Guidance", "lifecycle contextual guidance payload");
  ensureContains(shellConfig, "Commands Guidance", "commands contextual guidance payload");
  ensureContains(
    shellConfig,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "runtime migration boundary anchored to experimentalArtifactBrowser",
  );

  ensureContains(app, "handleSelectSurface", "cross-surface selection handler");
  ensureContains(app, "shellState.isGuidanceRailOpen", "cross-surface guidance-state branch");
  ensureContains(
    app,
    "createArtifactBrowserSurfaceGuidancePayload(nextSurface)",
    "surface guidance refresh on navigation transition",
  );
  ensureContains(
    app,
    "onOpenGuidance={() => shellActions.openGuidance(surfaceGuidancePayload)}",
    "shared guidance trigger for active surface",
  );

  ensureContains(
    migrationBoundary,
    "RUNS_RUNTIME_MIGRATION_BOUNDARY_PATH",
    "shared migration-boundary definition",
  );
}

async function validateBuiltBoundary() {
  const builtJs = await readRequiredFile("dist/webviews/experimental-artifact-browser/client.js");

  ensureContains(builtJs, "Runs Guidance", "built runs contextual guidance copy");
  ensureContains(builtJs, "Runtimes Guidance", "built runtimes contextual guidance copy");
  ensureContains(builtJs, "Lifecycle Guidance", "built lifecycle contextual guidance copy");
  ensureContains(builtJs, "Commands Guidance", "built commands contextual guidance copy");
}

async function main() {
  await validateSourceBoundary();

  if (process.argv.includes("--with-build-output")) {
    await validateBuiltBoundary();
  }

  process.stdout.write(
    "[shared-navigation-guidance-validate] shared navigation/guidance integration checks passed\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
