import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const distCli = path.join(repoRoot, "packages", "project-arch", "dist", "cli.js");
const sandboxRoot = path.join(repoRoot, ".sandbox");

export function parseSandboxInitArgs(argv = process.argv) {
  const [, , profileArg, ...initArgs] = argv;
  return {
    profile: profileArg ?? "default",
    initArgs,
  };
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: repoRoot,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertExists(sandboxDir, relativePath, profileName) {
  const target = path.join(sandboxDir, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`Expected file to exist for profile '${profileName}': ${relativePath}`);
  }
}

function assertMissing(sandboxDir, relativePath, profileName) {
  const target = path.join(sandboxDir, relativePath);
  if (fs.existsSync(target)) {
    throw new Error(`Expected file to be absent for profile '${profileName}': ${relativePath}`);
  }
}

function hasInitFlag(initArgs, flag) {
  return initArgs.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

export function verifyProfile(profileName, sandboxDir, initArgs = []) {
  switch (profileName) {
    case "smoke":
    case "default":
      assertExists(sandboxDir, "architecture/governance/init-default-behavior.md", profileName);
      assertExists(sandboxDir, "roadmap/projects/shared/manifest.json", profileName);
      assertExists(sandboxDir, "roadmap/projects/shared/phases/phase-1/overview.md", profileName);
      assertExists(
        sandboxDir,
        "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
        profileName,
      );
      break;
    case "full":
      assertExists(sandboxDir, "architecture/governance/init-full-behavior.md", profileName);
      assertExists(sandboxDir, "architecture/governance/init-tier-model.md", profileName);
      assertExists(sandboxDir, "roadmap/projects/shared/manifest.json", profileName);
      assertExists(sandboxDir, "roadmap/projects/shared/phases/phase-1/overview.md", profileName);
      assertExists(
        sandboxDir,
        "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
        profileName,
      );
      break;
    case "tier-a":
      assertExists(sandboxDir, "roadmap/manifest.json", profileName);
      assertExists(sandboxDir, "roadmap/projects/shared/manifest.json", profileName);
      assertExists(sandboxDir, "roadmap/projects/shared/phases/phase-1/overview.md", profileName);
      assertExists(
        sandboxDir,
        "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-define-project-overview.md",
        profileName,
      );
      assertExists(sandboxDir, "architecture/README.md", profileName);
      assertExists(sandboxDir, "architecture/governance/init-tier-model.md", profileName);
      assertExists(sandboxDir, "architecture/standards/repo-structure.md", profileName);
      assertExists(sandboxDir, "architecture/templates/ARCHITECTURE_SPEC_TEMPLATE.md", profileName);
      break;
    case "tier-b":
      assertExists(sandboxDir, "architecture/standards/nextjs-standards.md", profileName);
      assertExists(sandboxDir, "architecture/standards/react-standards.md", profileName);
      assertExists(sandboxDir, "architecture/standards/turborepo-standards.md", profileName);
      break;
    case "tier-c":
      assertExists(sandboxDir, "architecture/governance/init-surface-tier-mapping.md", profileName);
      assertMissing(sandboxDir, "architecture/standards/accessibility-standards.md", profileName);
      assertMissing(sandboxDir, "architecture/standards/api-design-standards.md", profileName);
      break;
    case "tier-d":
      assertExists(sandboxDir, "architecture/governance/init-sprawl-guardrails.md", profileName);
      assertMissing(sandboxDir, ".agent/instructions.md", profileName);
      assertMissing(sandboxDir, ".agent/workflows", profileName);
      break;
    default:
      throw new Error(`Unsupported sandbox init profile: ${profileName}`);
  }

  if (hasInitFlag(initArgs, "--with-workflows")) {
    assertExists(sandboxDir, ".project-arch/workflows/before-coding.workflow.md", profileName);
    assertExists(sandboxDir, ".project-arch/workflows/after-coding.workflow.md", profileName);
    assertExists(sandboxDir, ".project-arch/workflows/complete-task.workflow.md", profileName);
    assertExists(sandboxDir, ".project-arch/workflows/new-module.workflow.md", profileName);
    assertExists(sandboxDir, ".project-arch/workflows/diagnose.workflow.md", profileName);
    assertMissing(sandboxDir, ".github/workflows", profileName);
  } else {
    assertMissing(sandboxDir, ".project-arch/workflows", profileName);
    assertMissing(sandboxDir, ".github/workflows", profileName);
  }
}

export function main(argv = process.argv) {
  const { profile, initArgs } = parseSandboxInitArgs(argv);
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-arch-sandbox-"));
  const currentLink = path.join(sandboxRoot, "current");
  const profileLink = path.join(sandboxRoot, profile);

  console.log(`Sandbox profile: ${profile}`);
  if (initArgs.length > 0) {
    console.log(`Init args: ${initArgs.join(" ")}`);
  }

  run("pnpm", ["--filter", "project-arch", "build"]);

  console.log(`Sandbox: ${sandboxDir}`);
  fs.mkdirSync(sandboxRoot, { recursive: true });
  try {
    fs.rmSync(currentLink, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures for the link target path
  }
  fs.symlinkSync(sandboxDir, currentLink);
  try {
    fs.rmSync(profileLink, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures for the profile link target path
  }
  fs.symlinkSync(sandboxDir, profileLink);

  if (profile !== "smoke") {
    spawnSync("code", [sandboxDir], { stdio: "inherit", cwd: repoRoot });
  }

  run("node", [distCli, "init", ...initArgs], { cwd: sandboxDir });
  run("node", [distCli, "check"], { cwd: sandboxDir });
  verifyProfile(profile, sandboxDir, initArgs);

  console.log(`Sandbox [${profile}] ready at ${sandboxDir}`);
  console.log(`Profile link: ${profileLink}`);
}

const isMain =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
