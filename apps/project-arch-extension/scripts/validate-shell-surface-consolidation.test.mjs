import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-shell-consolidation-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-shell-surface-consolidation.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-shell-surface-consolidation.mjs", content);
}

async function seedMinimalConsolidationBoundary(root) {
  await writeFile(
    root,
    "package.json",
    JSON.stringify(
      {
        contributes: {
          views: {
            projectArch: [
              { id: "projectArch.artifacts.experimental", type: "webview" },
            ],
          },
          commands: [{ command: "projectArch.refreshArtifactNavigationExperimental" }],
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
    [
      "const sample = `ExperimentalArtifactBrowserShell`;",
      "const surface = `ArtifactBrowserSurface`;",
      "shellActions.openGuidance();",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserShell.tsx",
    [
      "const frame = `ShellNavigationFrame`;",
      "const active = <Frame activeGuidance={props.activeGuidance} onOpenGuidance={props.onOpenGuidance} />;",
    ].join("\n"),
  );
}

function runValidationScript(root, { withBuildOutput = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-shell-surface-consolidation.mjs");
  const args = withBuildOutput ? [scriptPath, "--with-build-output"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-shell-surface-consolidation", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal valid shell surface consolidation boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalConsolidationBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("consolidation checks passed");
  });

  it("fails when experimental shell frame wiring is missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalConsolidationBoundary(root);
    await writeFile(
      root,
      "src/navigation/experimentalArtifactBrowser/client/ExperimentalArtifactBrowserApp.tsx",
      "shellActions.openGuidance();\n",
    );

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shared shell composition wiring");
  });

  it("fails build-output mode when built guidance triggers are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalConsolidationBoundary(root);
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js", "console.log('missing');\n");

    const result = runValidationScript(root, { withBuildOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("built navigation-sheet trigger");
  });
});
