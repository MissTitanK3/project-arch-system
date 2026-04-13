import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const extensionRoot = path.resolve(import.meta.dirname, "..");

async function readRequiredFile(relativePath) {
  const absolutePath = path.join(extensionRoot, relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`[artifact-browser-migration-safety] Missing required file: ${relativePath}`);
  }
}

function ensureContains(content, fragment, label) {
  if (!content.includes(fragment)) {
    throw new Error(`[artifact-browser-migration-safety] Missing ${label}: ${fragment}`);
  }
}

async function validateSourceSafetyBoundary() {
  const packageJson = await readRequiredFile("package.json");
  const activationTest = await readRequiredFile("src/activation.test.ts");
  const manifestTest = await readRequiredFile("src/navigation/artifactNavigationManifest.test.ts");
  const navigationTree = await readRequiredFile("src/navigation/artifactNavigationTree.ts");

  ensureContains(packageJson, '"verify:artifact-browser-shell-composition"', "composition verify script");
  ensureContains(packageJson, '"verify:artifact-browser-shell-parity"', "parity verify script");
  ensureContains(packageJson, '"verify:shell-surface-consolidation"', "consolidation verify script");

  ensureContains(activationTest, "ARTIFACT_TREE_VIEW_ID", "baseline artifact activation regression coverage");
  ensureContains(
    activationTest,
    "EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID",
    "experimental artifact activation regression coverage",
  );
  ensureContains(
    activationTest,
    "REFRESH_EXPERIMENTAL_ARTIFACT_NAVIGATION_COMMAND_ID",
    "experimental refresh regression coverage",
  );

  ensureContains(
    manifestTest,
    "contributes baseline and experimental artifact browser views",
    "artifact coexistence manifest regression test",
  );
  ensureContains(
    manifestTest,
    "retains dedicated non-migrated surfaces",
    "non-migrated surface retention regression test",
  );

  ensureContains(
    navigationTree,
    "EXPERIMENTAL_ARTIFACT_TREE_VIEW_ID",
    "experimental artifact view registration boundary",
  );
  ensureContains(navigationTree, "ARTIFACT_TREE_VIEW_ID", "baseline artifact view registration boundary");
  ensureContains(
    navigationTree,
    "isWebviewToHostMessage",
    "shared message guard boundary",
  );
}

async function validateBuiltSafetyBoundary() {
  const builtJs = await readRequiredFile("dist/webviews/experimental-artifact-browser/client.js");

  ensureContains(builtJs, "Open Surface Guidance", "built shell guidance integration marker");
  ensureContains(builtJs, "Navigation Help", "built artifact navigation guidance marker");
  ensureContains(builtJs, "Launch Run", "built artifact workflow parity marker");
}

async function main() {
  await validateSourceSafetyBoundary();

  if (process.argv.includes("--with-build-output")) {
    await validateBuiltSafetyBoundary();
  }

  process.stdout.write(
    "[artifact-browser-migration-safety] artifact browser migration safety checks passed\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
