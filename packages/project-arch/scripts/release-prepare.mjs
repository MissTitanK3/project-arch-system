import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import console from "node:console";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const packageJsonPath = path.join(packageRoot, "package.json");
const changelogPath = path.join(packageRoot, "CHANGELOG.md");
const releaseReportPath = path.join(repoRoot, ".project-arch", "release", "release-check.json");

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

function parseArgs(argv) {
  const options = {
    version: null,
    dryRun: false,
    allowDirty: false,
    json: false,
    noTests: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--no-tests") {
      options.noTests = true;
      continue;
    }

    if (arg === "--version") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--version requires a semver value (for example: --version 1.6.0)");
      }
      options.version = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function usage() {
  return [
    "Local release preparation utility (pre-push / pre-publish)",
    "",
    "Usage:",
    "  node packages/project-arch/scripts/release-prepare.mjs [options]",
    "",
    "Options:",
    "  --version <semver>  Explicit release version to validate against package.json",
    "  --dry-run           Run checks but do not write .project-arch/release/release-check.json",
    "  --allow-dirty       Override clean-worktree gate (unsafe; reported in output)",
    "  --json              Emit machine-readable summary to stdout",
    "  --no-tests          Skip test gate (unsafe; reported in output)",
    "  --help              Show this message",
  ].join("\n");
}

function runCommand(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    ok: !result.error && result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function bytes(n) {
  if (typeof n !== "number" || Number.isNaN(n)) {
    return "unknown";
  }

  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNpmPackJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("npm pack --json produced empty output");
  }

  const startIndex = trimmed.indexOf("[");
  if (startIndex === -1) {
    throw new Error("npm pack --json did not produce JSON array output");
  }

  const jsonCandidate = trimmed.slice(startIndex);
  const parsed = JSON.parse(jsonCandidate);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("npm pack --json output did not include pack metadata");
  }

  return parsed[0];
}

function isUnsafeTarballFile(filePath) {
  if (/\/__tests__\//.test(filePath)) return true;
  if (/\.test\.(js|cjs|mjs|d\.ts|map)$/i.test(filePath)) return true;
  if (/\/test\//i.test(filePath) && /\.js$/i.test(filePath)) return true;
  return false;
}

function collectExpectedDistEntries(pkgJson) {
  const entries = new Set();

  const addValue = (value) => {
    if (typeof value !== "string") return;
    const normalized = value.replace(/^\.\//, "").replace(/\\/g, "/");
    if (normalized.startsWith("dist/")) {
      entries.add(normalized);
    }
  };

  addValue(pkgJson.main);
  addValue(pkgJson.types);

  if (pkgJson.bin && typeof pkgJson.bin === "object") {
    for (const value of Object.values(pkgJson.bin)) {
      addValue(value);
    }
  }

  const walkExports = (node) => {
    if (!node) return;
    if (typeof node === "string") {
      addValue(node);
      return;
    }

    if (Array.isArray(node)) {
      for (const value of node) {
        walkExports(value);
      }
      return;
    }

    if (typeof node === "object") {
      for (const value of Object.values(node)) {
        walkExports(value);
      }
    }
  };

  walkExports(pkgJson.exports);

  return [...entries].sort((a, b) => a.localeCompare(b));
}

function addCheck(results, id, label, ok, details, warning = false) {
  results.push({
    id,
    label,
    ok,
    warning,
    details,
  });
}

function gateStatusText(check) {
  if (check.ok && !check.warning) return "PASS";
  if (check.ok && check.warning) return "WARN";
  return "FAIL";
}

function printHumanSummary(report, options) {
  console.log("Local Release Preparation Summary");
  console.log("--------------------------------");
  console.log(`Package: ${report.package.name}`);
  console.log(`Version: ${report.package.targetVersion}`);
  console.log(`Tag: ${report.release.tag}`);
  console.log(`Branch: ${report.git.branch}`);
  console.log(`Commit: ${report.git.commit}`);
  console.log("");

  for (const check of report.checks) {
    console.log(`[${gateStatusText(check)}] ${check.label}: ${check.details}`);
  }

  console.log("");
  console.log("Publish Payload");
  console.log("---------------");
  console.log(`Tarball: ${report.payload.tarballName || "unknown"}`);
  console.log(`Files: ${report.payload.fileCount}`);
  console.log(`Tarball Size: ${bytes(report.payload.size)}`);
  console.log(`Unpacked Size: ${bytes(report.payload.unpackedSize)}`);

  if (report.payload.unsafeFiles.length > 0) {
    console.log(`Unsafe files detected (${report.payload.unsafeFiles.length}):`);
    for (const filePath of report.payload.unsafeFiles) {
      console.log(`  - ${filePath}`);
    }
  }

  if (report.payload.missingExpectedEntries.length > 0) {
    console.log(`Missing expected dist entries (${report.payload.missingExpectedEntries.length}):`);
    for (const filePath of report.payload.missingExpectedEntries) {
      console.log(`  - ${filePath}`);
    }
  }

  if (report.git.untrackedPackageFiles.length > 0) {
    console.log(`Untracked package files (${report.git.untrackedPackageFiles.length}):`);
    for (const filePath of report.git.untrackedPackageFiles) {
      console.log(`  - ${filePath}`);
    }
  }

  console.log("");
  if (report.conclusion.ok) {
    console.log("Conclusion: SAFE TO PROCEED WITH MANUAL PUSH/TAG/PUBLISH STEPS");
  } else {
    console.log("Conclusion: NOT READY FOR MANUAL PUSH/TAG/PUBLISH");
  }

  if (options.noTests) {
    console.log("Note: --no-tests was used (unsafe mode).");
  }

  if (options.allowDirty) {
    console.log("Note: --allow-dirty was used (unsafe mode).");
  }

  console.log("");
  console.log("Suggested Manual Commands (not executed)");
  console.log("---------------------------------------");
  for (const command of report.recommendedCommands) {
    console.log(command);
  }
}

function writeJsonReport(report) {
  fs.mkdirSync(path.dirname(releaseReportPath), { recursive: true });
  fs.writeFileSync(releaseReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error(usage());
    process.exit(1);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const startedAt = new Date();
  const checks = [];

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const packageVersion = packageJson.version;
  const targetVersion = options.version ?? packageVersion;
  const tagName = `v${targetVersion}`;

  const gitCommitResult = runCommand("git", ["rev-parse", "--short", "HEAD"], repoRoot);
  const gitBranchResult = runCommand("git", ["branch", "--show-current"], repoRoot);
  const gitStatusResult = runCommand("git", ["status", "--porcelain"], repoRoot);
  const untrackedPackageResult = runCommand(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "packages/project-arch"],
    repoRoot,
  );

  const branch = gitBranchResult.ok ? gitBranchResult.stdout.trim() : "unknown";
  const commit = gitCommitResult.ok ? gitCommitResult.stdout.trim() : "unknown";

  const allowedBranch = branch === "main" || /^release\/.+/.test(branch);
  addCheck(
    checks,
    "branch-policy",
    "Release branch policy",
    allowedBranch,
    allowedBranch
      ? `Current branch '${branch}' is allowed`
      : `Current branch '${branch}' is not allowed (expected main or release/*)`,
  );

  const semverOk = SEMVER_PATTERN.test(targetVersion);
  addCheck(
    checks,
    "version-semver",
    "Package version semver",
    semverOk,
    semverOk ? `Version '${targetVersion}' is valid semver` : `Version '${targetVersion}' is not valid semver`,
  );

  const versionMatch = packageVersion === targetVersion;
  addCheck(
    checks,
    "version-match",
    "package.json version consistency",
    versionMatch,
    versionMatch
      ? `package.json version matches target version (${targetVersion})`
      : `package.json version (${packageVersion}) does not match target version (${targetVersion})`,
  );

  const changelog = fs.readFileSync(changelogPath, "utf8");
  const changelogRegex = new RegExp(
    `^## \\[${escapeRegExp(targetVersion)}\\](?:\\s|$)`,
    "m",
  );
  const changelogHasVersion = changelogRegex.test(changelog);
  addCheck(
    checks,
    "changelog-version",
    "CHANGELOG version entry",
    changelogHasVersion,
    changelogHasVersion
      ? `CHANGELOG contains entry for ${targetVersion}`
      : `CHANGELOG is missing entry for ${targetVersion}`,
  );

  const tagExistsResult = runCommand("git", ["tag", "--list", tagName], repoRoot);
  const localTagExists = tagExistsResult.ok && tagExistsResult.stdout.trim() === tagName;
  addCheck(
    checks,
    "tag-availability",
    "Local tag availability",
    !localTagExists,
    localTagExists
      ? `Local tag '${tagName}' already exists`
      : `Local tag '${tagName}' does not exist and is available`,
  );

  const cleanWorktree = gitStatusResult.ok ? gitStatusResult.stdout.trim().length === 0 : false;
  const cleanWorktreeGateOk = cleanWorktree || options.allowDirty;
  addCheck(
    checks,
    "git-clean",
    "Git working tree clean",
    cleanWorktreeGateOk,
    cleanWorktree
      ? "Working tree is clean"
      : options.allowDirty
        ? "Working tree is dirty, but --allow-dirty override was provided"
        : "Working tree is dirty",
    options.allowDirty && !cleanWorktree,
  );

  const untrackedPackageFiles = untrackedPackageResult.ok
    ? untrackedPackageResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    : [];

  const untrackedPayloadOk = untrackedPackageFiles.length === 0;
  addCheck(
    checks,
    "git-untracked-payload",
    "Untracked package payload files",
    untrackedPayloadOk,
    untrackedPayloadOk
      ? "No untracked files under packages/project-arch"
      : `${untrackedPackageFiles.length} untracked file(s) under packages/project-arch may affect payload`,
  );

  const runGate = (id, label, command, args, cwd) => {
    const gateResult = runCommand(command, args, cwd);
    const commandText = `${command} ${args.join(" ")}`.trim();

    addCheck(
      checks,
      id,
      label,
      gateResult.ok,
      gateResult.ok
        ? `Passed: ${commandText}`
        : `Failed: ${commandText}${gateResult.error ? ` (${gateResult.error})` : ""}`,
    );

    return gateResult;
  };

  runGate("typecheck", "Typecheck", "pnpm", ["--filter", "project-arch", "typecheck"], repoRoot);
  runGate("lint", "Lint", "pnpm", ["--filter", "project-arch", "lint"], repoRoot);

  if (options.noTests) {
    addCheck(
      checks,
      "test",
      "Test",
      true,
      "Skipped due to --no-tests override",
      true,
    );
  } else {
    runGate("test", "Test", "pnpm", ["--filter", "project-arch", "test"], repoRoot);
  }

  runGate("build", "Build", "pnpm", ["--filter", "project-arch", "build"], repoRoot);

  const packResult = runGate(
    "pack-dry-run",
    "npm pack --dry-run",
    "npm",
    ["pack", "--dry-run", "--json"],
    packageRoot,
  );

  let packMetadata = null;
  let payloadUnsafeFiles = [];
  let missingExpectedEntries = [];

  if (packResult.ok) {
    try {
      packMetadata = parseNpmPackJson(packResult.stdout);
      const tarballFiles = Array.isArray(packMetadata.files)
        ? packMetadata.files
          .map((entry) => String(entry.path || ""))
          .filter(Boolean)
        : [];

      payloadUnsafeFiles = tarballFiles.filter((filePath) => isUnsafeTarballFile(filePath));

      const expectedEntries = collectExpectedDistEntries(packageJson);
      const tarballFileSet = new Set(tarballFiles);
      missingExpectedEntries = expectedEntries.filter((entry) => !tarballFileSet.has(entry));

      const payloadClean = payloadUnsafeFiles.length === 0 && missingExpectedEntries.length === 0;
      addCheck(
        checks,
        "payload-clean",
        "Publish payload cleanliness",
        payloadClean,
        payloadClean
          ? "Payload excludes test artifacts and includes expected dist entrypoints"
          : `Payload issues detected (unsafe files: ${payloadUnsafeFiles.length}, missing expected entries: ${missingExpectedEntries.length})`,
      );
    } catch (error) {
      addCheck(
        checks,
        "payload-clean",
        "Publish payload cleanliness",
        false,
        `Unable to parse npm pack --json output: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    addCheck(
      checks,
      "payload-clean",
      "Publish payload cleanliness",
      false,
      "Skipped because npm pack --dry-run failed",
    );
  }

  const recommendedCommands = [
    `git add packages/project-arch/CHANGELOG.md packages/project-arch/package.json`,
    `git commit -m "release(project-arch): ${tagName}"`,
    `git tag ${tagName}`,
    `git push origin ${branch || "main"} --tags`,
    `pnpm --filter project-arch publish --access public`,
  ];

  const hardFailures = checks.filter((check) => !check.ok && !check.warning);
  const safeToProceed = hardFailures.length === 0;

  const report = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    package: {
      name: packageJson.name,
      version: packageVersion,
      targetVersion,
    },
    release: {
      tag: tagName,
    },
    git: {
      branch,
      commit,
      allowDirtyOverride: options.allowDirty,
      cleanWorktree,
      untrackedPackageFiles,
    },
    checks,
    payload: {
      tarballName: packMetadata?.filename ?? null,
      fileCount: Array.isArray(packMetadata?.files) ? packMetadata.files.length : 0,
      size: typeof packMetadata?.size === "number" ? packMetadata.size : null,
      unpackedSize: typeof packMetadata?.unpackedSize === "number" ? packMetadata.unpackedSize : null,
      unsafeFiles: payloadUnsafeFiles,
      missingExpectedEntries,
    },
    recommendedCommands,
    options: {
      dryRun: options.dryRun,
      json: options.json,
      noTests: options.noTests,
      allowDirty: options.allowDirty,
    },
    conclusion: {
      ok: safeToProceed,
      message: safeToProceed
        ? "Safe to proceed with manual push/tag/publish commands."
        : "Release preparation failed. Resolve failed checks before manual push/tag/publish.",
    },
  };

  if (!options.dryRun) {
    writeJsonReport(report);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanSummary(report, options);
    if (!options.dryRun) {
      console.log("");
      console.log(`Machine-readable report: ${path.relative(repoRoot, releaseReportPath)}`);
    } else {
      console.log("");
      console.log("Dry-run mode: report file was not written.");
    }
  }

  if (!safeToProceed) {
    process.exitCode = 1;
  }
}

main();
