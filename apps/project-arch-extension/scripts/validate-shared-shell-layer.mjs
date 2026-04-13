import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[shared-shell-validate] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[shared-shell-validate] Missing ${label}: ${fragment}`);
  }
}

async function validateSourceBoundary() {
  const preactBoundary = await readRequiredFile("src/navigation/preact/index.ts");
  const shellState = await readRequiredFile("src/navigation/preact/shell/state.ts");
  const shellNavigation = await readRequiredFile("src/navigation/preact/shell/navigation.tsx");
  const tokenStyles = await readRequiredFile("src/navigation/preact/styles/tokens.css");
  const webviewClient = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/experimentalArtifactBrowserClient.tsx",
  );

  ensureContains(preactBoundary, "ShellLayout", "shell export boundary");
  ensureContains(preactBoundary, "useShellLayoutState", "shell state export boundary");
  ensureContains(preactBoundary, "ShellNavigationFrame", "shell navigation export boundary");
  ensureContains(shellState, "setShellHeaderCollapsed", "shell state transition helper");
  ensureContains(shellNavigation, "activeGuidance", "guidance payload boundary");
  ensureContains(shellNavigation, "onCloseGuidance", "guidance close boundary");
  ensureContains(shellNavigation, "onOpenGuidance", "guidance open boundary");

  ensureContains(tokenStyles, "--pa-space-4", "token definition");
  ensureContains(tokenStyles, ".pa-shell-layout", "shell layout selector");
  ensureContains(tokenStyles, ".pa-shell-navigation-frame", "shell navigation selector");
  ensureContains(tokenStyles, ".pa-shell-sheet", "shell sheet selector");
  ensureContains(tokenStyles, ".pa-section", "primitive section selector");

  ensureContains(webviewClient, 'import "../../preact/styles/tokens.css";', "token stylesheet import");
}

async function validateBuiltBoundary() {
  const builtCss = await readRequiredFile("dist/webviews/experimental-artifact-browser/client.css");
  ensureContains(builtCss, ".pa-shell-layout", "built shell layout selector");
  ensureContains(builtCss, ".pa-shell-navigation-frame", "built shell navigation selector");
  ensureContains(builtCss, ".pa-shell-sheet", "built shell sheet selector");
  ensureContains(builtCss, ".pa-section", "built primitive selector");
}

async function main() {
  await validateSourceBoundary();

  if (process.argv.includes("--with-build-output")) {
    await validateBuiltBoundary();
  }

  process.stdout.write("[shared-shell-validate] shared shell boundary checks passed\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
