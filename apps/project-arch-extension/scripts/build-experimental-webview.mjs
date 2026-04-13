import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import * as esbuild from "esbuild";

const extensionRoot = path.resolve(import.meta.dirname, "..");
const entryFile = path.join(
  extensionRoot,
  "src/navigation/experimentalArtifactBrowser/client/experimentalArtifactBrowserClient.tsx",
);
const outFile = path.join(
  extensionRoot,
  "dist/webviews/experimental-artifact-browser/client.js",
);

const sharedBuildOptions = {
  entryPoints: [entryFile],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  jsxImportSource: "preact",
  sourcemap: true,
  logLevel: "info",
  legalComments: "none",
};

async function ensureOutputDirectory() {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
}

async function buildOnce() {
  await ensureOutputDirectory();
  await esbuild.build(sharedBuildOptions);
}

async function buildWatch() {
  await ensureOutputDirectory();
  const context = await esbuild.context(sharedBuildOptions);
  await context.watch();
  process.stdout.write("[experimental-webview] watching for changes...\n");
}

async function main() {
  if (process.argv.includes("--watch")) {
    await buildWatch();
    return;
  }

  await buildOnce();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
