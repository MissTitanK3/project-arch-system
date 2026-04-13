import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-artifact-shell-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-artifact-browser-shell-composition.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-artifact-browser-shell-composition.mjs", content);
}

async function seedMinimalCompositionBoundary(root) {
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
    'import { ExperimentalArtifactBrowserShell } from "./ExperimentalArtifactBrowserShell";\nimport { ArtifactBrowserSurface } from "./ArtifactBrowserSurface";\n',
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserShell.tsx",
    "const frame = 'ShellNavigationFrame';\n",
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ArtifactBrowserSurface.tsx",
    "const surface = 'SurfaceSection';\n",
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/artifactBrowserShellConfig.tsx",
    "export const artifactBrowserShellNavigationItems = [];\nexport function createArtifactBrowserShellSurfaceSlots(){}\n",
  );
}

function runValidationScript(root, { withBuildOutput = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-artifact-browser-shell-composition.mjs");
  const args = withBuildOutput ? [scriptPath, "--with-build-output"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-artifact-browser-shell-composition", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal migrated artifact-shell composition boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalCompositionBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("composition checks passed");
  });

  it("fails when the app no longer references the extracted shell composition", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalCompositionBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
      'import { ArtifactBrowserSurface } from "./ArtifactBrowserSurface";\n',
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("migrated shell composition import");
  });

  it("fails build-output mode when migrated-shell markers are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalCompositionBoundary(root);
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js", "console.log('missing');\n");

    const result = runValidationScript(root, { withBuildOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("built shell guidance trigger");
  });
});
