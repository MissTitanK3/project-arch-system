import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function createTempExtensionWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-webview-validate-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyValidationScriptFixture(root) {
  const source = path.join(process.cwd(), "scripts/validate-experimental-webview-assets.mjs");
  const content = await fs.readFile(source, "utf8");
  await writeFile(root, "scripts/validate-experimental-webview-assets.mjs", content);
}

async function runValidationScript(root, { withVsix = false } = {}) {
  const scriptPath = path.join(root, "scripts/validate-experimental-webview-assets.mjs");
  const args = withVsix ? [scriptPath, "--with-vsix"] : [scriptPath];
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("scripts/validate-experimental-webview-assets", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("passes when deterministic bundle outputs exist", async () => {
    const root = await createTempExtensionWorkspace();
    await copyValidationScriptFixture(root);
    await writeFile(
      root,
      "dist/webviews/experimental-artifact-browser/client.js",
      "const id = 'project-arch-experimental-artifact-browser-root';",
    );
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js.map", "{}");

    const result = await runValidationScript(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("asset boundary checks passed");
  });

  it("fails when expected bundle marker is missing", async () => {
    const root = await createTempExtensionWorkspace();
    await copyValidationScriptFixture(root);
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js", "console.log('x')");
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js.map", "{}");

    const result = await runValidationScript(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("root container marker");
  });

  it("fails VSIX validation when expected asset entries are absent", async () => {
    const root = await createTempExtensionWorkspace();
    await copyValidationScriptFixture(root);
    await writeFile(
      root,
      "dist/webviews/experimental-artifact-browser/client.js",
      "const id = 'project-arch-experimental-artifact-browser-root';",
    );
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js.map", "{}");
    await writeFile(root, ".artifacts/project-arch-extension.vsix", "not-a-real-vsix");

    const result = await runValidationScript(root, { withVsix: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected asset entry");
  });

  it("fails VSIX validation when non-bounded paths are present", async () => {
    const root = await createTempExtensionWorkspace();
    await copyValidationScriptFixture(root);
    await writeFile(
      root,
      "dist/webviews/experimental-artifact-browser/client.js",
      "const id = 'project-arch-experimental-artifact-browser-root';",
    );
    await writeFile(root, "dist/webviews/experimental-artifact-browser/client.js.map", "{}");
    await writeFile(
      root,
      ".artifacts/project-arch-extension.vsix",
      "extension/dist/webviews/experimental-artifact-browser/client.js extension/dist/webviews/experimental-artifact-browser/client.js.map extension/.sandbox/dev-workspace/readme.md",
    );

    const result = await runValidationScript(root, { withVsix: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("non-bounded artifact path");
  });
});
