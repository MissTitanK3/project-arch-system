import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(
  extensionRoot,
  "dist/webviews/experimental-artifact-browser/client.js",
);
const bundleMapPath = `${bundlePath}.map`;
const vsixPath = path.join(extensionRoot, ".artifacts/project-arch-extension.vsix");

async function ensureFileExists(targetPath, label) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`[experimental-webview-validate] Missing ${label}: ${targetPath}`);
  }
}

async function ensureBundleLooksValid() {
  await ensureFileExists(bundlePath, "bundle output");
  await ensureFileExists(bundleMapPath, "bundle sourcemap output");

  const content = await fs.readFile(bundlePath, "utf8");
  if (!content.includes("project-arch-experimental-artifact-browser-root")) {
    throw new Error(
      "[experimental-webview-validate] Bundle does not contain expected root container marker.",
    );
  }
}

async function ensureVsixContainsBundle() {
  await ensureFileExists(vsixPath, "VSIX artifact");

  const bytes = await fs.readFile(vsixPath);
  const text = bytes.toString("latin1");
  const expectedEntries = [
    "extension/dist/webviews/experimental-artifact-browser/client.js",
    "extension/dist/webviews/experimental-artifact-browser/client.js.map",
  ];

  for (const entry of expectedEntries) {
    if (!text.includes(entry)) {
      throw new Error(
        `[experimental-webview-validate] VSIX does not include expected asset entry: ${entry}`,
      );
    }
  }

  const forbiddenEntries = ["extension/.sandbox/", "extension/scripts/"];
  for (const entry of forbiddenEntries) {
    if (text.includes(entry)) {
      throw new Error(
        `[experimental-webview-validate] VSIX includes non-bounded artifact path: ${entry}`,
      );
    }
  }
}

async function main() {
  await ensureBundleLooksValid();

  if (process.argv.includes("--with-vsix")) {
    await ensureVsixContainsBundle();
  }

  process.stdout.write("[experimental-webview-validate] asset boundary checks passed\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
