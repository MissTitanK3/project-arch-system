import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[shell-consolidation-validate] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[shell-consolidation-validate] Missing ${label}: ${fragment}`);
  }
}

function ensureNotContains(content, fragment, label) {
  if (content.includes(fragment)) {
    throw new Error(`[shell-consolidation-validate] Unexpected ${label}: ${fragment}`);
  }
}

async function validateManifestAndWiring() {
  const manifest = await readRequiredFile("package.json");
  const experimentalApp = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
  );
  const experimentalShell = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserShell.tsx",
  );

  ensureContains(manifest, '"projectArch.artifacts.experimental"', "experimental artifact view contribution");
  ensureNotContains(manifest, '"projectArch.commandCatalog"', "command catalog standalone contribution");
  ensureNotContains(manifest, '"projectArch.lifecycle"', "lifecycle standalone contribution");
  ensureNotContains(manifest, '"projectArch.runs"', "runs standalone contribution");
  ensureNotContains(manifest, '"projectArch.runtimes"', "runtimes standalone contribution");
  ensureContains(
    manifest,
    '"projectArch.refreshArtifactNavigationExperimental"',
    "experimental refresh command retention",
  );

  ensureContains(experimentalApp, "ExperimentalArtifactBrowserShell", "shared shell composition wiring");
  ensureContains(experimentalApp, "ArtifactBrowserSurface", "artifact surface composition wiring");
  ensureContains(experimentalApp, "shellActions.openGuidance", "shell guidance action wiring");
  ensureContains(experimentalShell, "ShellNavigationFrame", "shared shell frame wiring");
  ensureContains(experimentalShell, "activeGuidance={props.activeGuidance}", "shell guidance payload state wiring");
  ensureContains(experimentalShell, "onOpenGuidance={props.onOpenGuidance}", "shell guidance reopen wiring");
}

async function validateBuiltOutput() {
  const builtJs = await readRequiredFile("dist/webviews/experimental-artifact-browser/client.js");
  ensureContains(builtJs, "Open navigation menu", "built navigation-sheet trigger");
  ensureContains(builtJs, "Open guidance sheet", "built guidance-sheet trigger");
  ensureContains(builtJs, "Open Surface Guidance", "built guidance action trigger");
}

async function main() {
  await validateManifestAndWiring();

  if (process.argv.includes("--with-build-output")) {
    await validateBuiltOutput();
  }

  process.stdout.write("[shell-consolidation-validate] shell surface consolidation checks passed\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
