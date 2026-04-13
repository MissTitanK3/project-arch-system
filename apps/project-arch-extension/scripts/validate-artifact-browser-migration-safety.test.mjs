import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-migration-safety-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-artifact-browser-migration-safety.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-artifact-browser-migration-safety.mjs", content);
}

async function seedMinimalSafetyBoundary(root) {
  await writeFile(
    root,
    "package.json",
    JSON.stringify(
      {
        scripts: {
          "verify:artifact-browser-shell-composition": "ok",
          "verify:artifact-browser-shell-parity": "ok",
          "verify:shell-surface-consolidation": "ok",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    root,
    "src/activation.test.ts",
    [
      "ARTIFACT_TREE_VIEW_ID",
      "EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID",
      "REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/artifactNavigationManifest.test.ts",
    [
      "contributes baseline and experimental artifact browser views",
      "retains dedicated non-migrated surfaces",
    ].join("\n"),
  );
  await writeFile(
    root,
    "src/navigation/artifactNavigationTree.ts",
    ["ARTIFACT_TREE_VIEW_ID", "EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID", "isWebviewToHostMessage"].join(
      "\n",
    ),
  );
}

function runValidationScript(root, { withBuildOutput = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-artifact-browser-migration-safety.mjs");
  const args = withBuildOutput ? [scriptPath, "--with-build-output"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-artifact-browser-migration-safety", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a minimal migration safety boundary", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalSafetyBoundary(root);

    const result = runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("migration safety checks passed");
  });

  it("fails when coexistence manifest test markers are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalSafetyBoundary(root);
    await writeFile(root, "src/navigation/artifactNavigationManifest.test.ts", "baseline only\n");

    const result = runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("artifact coexistence manifest regression test");
  });

  it("fails build-output mode when migrated shell markers are missing", async () => {
    const root = await createTempWorkspace();
    await copyValidationScriptFixture(root);
    await seedMinimalSafetyBoundary(root);
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js", "console.log('missing');\n");

    const result = runValidationScript(root, { withBuildOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("built shell guidance integration marker");
  });
});
