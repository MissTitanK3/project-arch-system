import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[artifact-browser-shell-validate] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[artifact-browser-shell-validate] Missing ${label}: ${fragment}`);
  }
}

function ensureNotContains(content, fragment, label) {
  if (content.includes(fragment)) {
    throw new Error(`[artifact-browser-shell-validate] Unexpected ${label}: ${fragment}`);
  }
}

async function validateSourceBoundary() {
  const app = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
  );
  const shell = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserShell.tsx",
  );
  const surface = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ArtifactBrowserSurface.tsx",
  );
  const shellConfig = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
  );

  ensureContains(app, "ExperimentalArtifactBrowserShell", "migrated shell composition import");
  ensureContains(app, "ArtifactBrowserSurface", "artifact surface import");
  ensureContains(shell, "ShellNavigationFrame", "shared shell frame usage");
  ensureContains(shellConfig, "artifactBrowserShellNavigationItems", "shell navigation config");
  ensureContains(shellConfig, "createArtifactBrowserShellSurfaceSlots", "shell slot config");
  ensureNotContains(surface, "ShellLayout", "artifact surface owning shell layout");
  ensureNotContains(surface, "ShellNavigationFrame", "artifact surface owning shell navigation");
}

async function validateBuiltBoundary() {
  const builtJs = await readRequiredFile("dist/webviews/experimental-artifact-browser/client.js");

  ensureContains(builtJs, "Open Surface Guidance", "built shell guidance trigger");
  ensureContains(builtJs, "Runs (Pending Migration)", "built pending surface placeholder");
}

async function main() {
  await validateSourceBoundary();

  if (process.argv.includes("--with-build-output")) {
    await validateBuiltBoundary();
  }

  process.stdout.write(
    "[artifact-browser-shell-validate] artifact browser shell composition checks passed\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
