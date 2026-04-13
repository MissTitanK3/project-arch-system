import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-shell-parity-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-artifact-browser-shell-parity.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-artifact-browser-shell-parity.mjs", content);
}

async function seedMinimalParityBoundary(root) {
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ArtifactBrowserSurface.tsx",
    [
      'const open = { type: "openEdit" };',
      'const copy = { type: "copyPath" };',
      'const preview = { type: "openPreview" };',
      "toOpenArtifactInspectorMessage();",
      "toLaunchTaskMessage();",
      "toCreateDiscoveredFromSelectedTaskMessage();",
      "toCreateLaneTaskMessage();",
      "toStagedRunCommandMessage();",
      "toUpdateWorkflowChecklistItemMessage();",
      "toStageChatOpenMessage();",
      "toStageChatSendIntentMessage();",
      "props.onOpenGuidance(payload);",
      "Navigation Help",
      "File Actions Help",
      "Stage Chat Help",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
    "onOpenGuidance={shellActions.openGuidance}\n",
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
    [
      "createArtifactNavigationGuidancePayload();",
      "createArtifactFileActionsGuidancePayload();",
      "createArtifactStageChatGuidancePayload();",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/experimentalArtifactBrowserActions.ts",
    'import type { WebviewToHostMessage } from "./types";\n',
  );
  await writeFile(
    root,
    "src/navigation/artifactBrowserMessageContracts.ts",
    "export const WEBVIEW_TO_HOST_MESSAGE_TYPES = new Set();\n",
  );
  await writeFile(
    root,
    "src/navigation/artifactNavigationTree.ts",
    [
      "if (!isWebviewToHostMessage(message)) return;",
      'if (message.type === "runCommand") return;',
      'if (message.type === "launchTask") return;',
      'if (message.type === "stageChatSendIntent") return;',
    ].join("\n"),
  );
}

function runValidationScript(root, { withBuildOutput = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-artifact-browser-shell-parity.mjs");
  const args = withBuildOutput ? [scriptPath, "--with-build-output"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-artifact-browser-shell-parity", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal artifact-browser shell parity boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalParityBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("parity checks passed");
  });

  it("fails when stage-chat parity markers are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalParityBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/ArtifactBrowserSurface.tsx",
      [
        'const open = { type: "openEdit" };',
        'const copy = { type: "copyPath" };',
        'const preview = { type: "openPreview" };',
        "toOpenArtifactInspectorMessage();",
        "toLaunchTaskMessage();",
        "toCreateDiscoveredFromSelectedTaskMessage();",
        "toCreateLaneTaskMessage();",
        "toStagedRunCommandMessage();",
        "toUpdateWorkflowChecklistItemMessage();",
        "props.onOpenGuidance(payload);",
        "Navigation Help",
        "File Actions Help",
      ].join("\n"),
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("stage-chat open parity");
  });

  it("fails build-output mode when shell parity action labels are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalParityBoundary(root);
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js", "console.log('missing');\n");

    const result = runValidationScript(root, { withBuildOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("built workflow action parity");
  });
});
