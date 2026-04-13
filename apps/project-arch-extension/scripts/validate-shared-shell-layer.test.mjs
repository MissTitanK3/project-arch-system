import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-shell-validate-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-shared-shell-layer.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-shared-shell-layer.mjs", content);
}

async function seedMinimalShellBoundary(root) {
  await writeFile(
    root,
    "src/navigation/preact/index.ts",
    "export { ShellLayout, ShellNavigationFrame, useShellLayoutState } from './shell';\n",
  );
  await writeFile(
    root,
    "src/navigation/preact/shell/state.ts",
    "export function setShellHeaderCollapsed(){}\n",
  );
  await writeFile(
    root,
    "src/navigation/preact/shell/navigation.tsx",
    "const activeGuidance = undefined;\nconst onOpenGuidance = () => {};\nconst onCloseGuidance = () => {};\n",
  );
  await writeFile(
    root,
    "src/navigation/preact/styles/tokens.css",
    ":root { --pa-space-4: 1rem; }\n.pa-shell-layout{}\n.pa-shell-navigation-frame{}\n.pa-shell-sheet{}\n.pa-section{}\n",
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/experimentalArtifactBrowserClient.tsx",
    'import "../../preact/styles/tokens.css";\n',
  );
}

function runValidationScript(root, { withBuildOutput = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-shared-shell-layer.mjs");
  const args = withBuildOutput ? [scriptPath, "--with-build-output"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-shared-shell-layer", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal valid shared shell boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("boundary checks passed");
  });

  it("fails when required token stylesheet import is missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/experimentalArtifactBrowserClient.tsx",
      "// missing stylesheet import\n",
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("token stylesheet import");
  });

  it("fails build-output mode when bundled css markers are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalShellBoundary(root);
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.css", "body{}\n");

    const result = runValidationScript(root, { withBuildOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("built shell layout selector");
  });
});
