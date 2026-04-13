import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const extensionRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(extensionRoot, "..", "..");
const sandboxRoot = path.join(extensionRoot, ".sandbox");
const sandboxBinDir = path.join(sandboxRoot, "bin");
const sandboxWorkspaceDir = path.join(sandboxRoot, "dev-workspace");
const projectArchCliPath = path.join(repoRoot, "packages", "project-arch", "dist", "cli.js");

async function ensureProjectArchBuildExists() {
  try {
    await fs.access(projectArchCliPath);
  } catch {
    throw new Error(
      `Expected built Project Arch CLI at ${projectArchCliPath}. Run the project-arch build first.`,
    );
  }
}

async function recreateSandboxWorkspace() {
  await fs.rm(sandboxWorkspaceDir, { recursive: true, force: true });
  await fs.mkdir(sandboxWorkspaceDir, { recursive: true });
}

async function writeSandboxPackageJson() {
  const packageJsonPath = path.join(sandboxWorkspaceDir, "package.json");
  const packageJson = {
    name: "project-arch-extension-dev-sandbox",
    private: true,
    version: "0.0.0",
  };

  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function writePaShim() {
  await fs.mkdir(sandboxBinDir, { recursive: true });

  const shimPath = path.join(sandboxBinDir, "pa");
  const shimContent = `#!/usr/bin/env bash
set -euo pipefail
node "${projectArchCliPath}" "$@"
`;

  await fs.writeFile(shimPath, shimContent, "utf8");
  await fs.chmod(shimPath, 0o755);
}

async function runPaInit() {
  await new Promise((resolve, reject) => {
    const child = spawn(path.join(sandboxBinDir, "pa"), ["init"], {
      cwd: sandboxWorkspaceDir,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${sandboxBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pa init failed with exit code ${code ?? 1}.`));
    });
  });
}

async function writeReadme() {
  const readmePath = path.join(sandboxRoot, "README.md");
  const content = `# project-arch-extension dev sandbox

This directory is recreated by the extension debug prelaunch flow.

- \`bin/pa\` is a local shim that runs the built workspace CLI.
- \`dev-workspace/\` is the fresh repository opened by the Extension Development Host.
- \`pa init\` is run automatically before each debug launch.
`;

  await fs.writeFile(readmePath, content, "utf8");
}

async function main() {
  await ensureProjectArchBuildExists();
  await fs.mkdir(sandboxRoot, { recursive: true });
  await writePaShim();
  await recreateSandboxWorkspace();
  await writeSandboxPackageJson();
  await runPaInit();
  await writeReadme();
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
