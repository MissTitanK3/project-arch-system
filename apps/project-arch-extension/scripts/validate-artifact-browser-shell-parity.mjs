import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[artifact-browser-shell-parity] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[artifact-browser-shell-parity] Missing ${label}: ${fragment}`);
  }
}

async function validateSourceParityBoundary() {
  const artifactSurface = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ArtifactBrowserSurface.tsx",
  );
  const app = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
  );
  const shellConfig = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
  );
  const actions = await readRequiredFile(
    "src/navigation/experimentalArtifactBrowser/client/experimentalArtifactBrowserActions.ts",
  );
  const contracts = await readRequiredFile("src/navigation/artifactBrowserMessageContracts.ts");
  const tree = await readRequiredFile("src/navigation/artifactNavigationTree.ts");

  ensureContains(artifactSurface, 'type: "openEdit"', "file action openEdit parity");
  ensureContains(artifactSurface, 'type: "copyPath"', "file action copyPath parity");
  ensureContains(artifactSurface, 'type: "openPreview"', "file action openPreview parity");
  ensureContains(
    artifactSurface,
    "toOpenArtifactInspectorMessage",
    "inspector action parity",
  );
  ensureContains(artifactSurface, "toLaunchTaskMessage", "workflow launch parity");
  ensureContains(
    artifactSurface,
    "toCreateDiscoveredFromSelectedTaskMessage",
    "workflow discovered-task parity",
  );
  ensureContains(artifactSurface, "toCreateLaneTaskMessage", "workflow lane-task parity");
  ensureContains(artifactSurface, "toStagedRunCommandMessage", "command staging parity");
  ensureContains(
    artifactSurface,
    "toUpdateWorkflowChecklistItemMessage",
    "workflow checklist parity",
  );
  ensureContains(artifactSurface, "toStageChatOpenMessage", "stage-chat open parity");
  ensureContains(artifactSurface, "toStageChatSendIntentMessage", "stage-chat intent parity");
  ensureContains(artifactSurface, "props.onOpenGuidance(", "shell guidance opener usage");
  ensureContains(artifactSurface, "Navigation Help", "navigation guidance affordance");
  ensureContains(artifactSurface, "File Actions Help", "file guidance affordance");
  ensureContains(artifactSurface, "Stage Chat Help", "stage-chat guidance affordance");

  ensureContains(app, "onOpenGuidance={shellActions.openGuidance}", "app-to-surface shell guidance wiring");
  ensureContains(shellConfig, "createArtifactNavigationGuidancePayload", "artifact navigation guidance helper");
  ensureContains(shellConfig, "createArtifactFileActionsGuidancePayload", "artifact file guidance helper");
  ensureContains(shellConfig, "createArtifactStageChatGuidancePayload", "artifact stage-chat guidance helper");

  ensureContains(actions, "import type { WebviewToHostMessage }", "shared host message type usage");
  ensureContains(contracts, "WEBVIEW_TO_HOST_MESSAGE_TYPES", "shared message type set");
  ensureContains(tree, "isWebviewToHostMessage", "host message guard usage");
  ensureContains(tree, 'if (message.type === "runCommand")', "host runCommand handling");
  ensureContains(tree, 'if (message.type === "launchTask")', "host launchTask handling");
  ensureContains(tree, 'if (message.type === "stageChatSendIntent")', "host stage-chat handling");
}

async function validateBuiltParityBoundary() {
  const builtJs = await readRequiredFile("dist/webviews/experimental-artifact-browser/client.js");

  ensureContains(builtJs, "Launch Run", "built workflow action parity");
  ensureContains(builtJs, "Create Planned", "built lane task action parity");
  ensureContains(builtJs, "Open Stage Chat", "built stage-chat action parity");
  ensureContains(builtJs, "Navigation Help", "built navigation guidance affordance");
  ensureContains(builtJs, "File Actions Help", "built file guidance affordance");
  ensureContains(builtJs, "Stage Chat Help", "built stage-chat guidance affordance");
}

async function main() {
  await validateSourceParityBoundary();

  if (process.argv.includes("--with-build-output")) {
    await validateBuiltParityBoundary();
  }

  process.stdout.write("[artifact-browser-shell-parity] artifact browser shell parity checks passed\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
