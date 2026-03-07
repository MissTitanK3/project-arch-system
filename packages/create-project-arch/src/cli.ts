#!/usr/bin/env node
import path from "path";
import fs from "fs-extra";
import { spawnSync } from "child_process";
import { Command } from "commander";

interface CreateOptions {
  template: string;
  apps: string;
  pm: string;
  withAi: boolean;
  withDocsSite: boolean;
  force: boolean;
}

function getTemplatesRoot(): string {
  return path.resolve(__dirname, "../templates");
}

async function getProjectArchVersion(): Promise<string> {
  const projectArchEntry = require.resolve("project-arch");
  const projectArchPkgPath = path.resolve(projectArchEntry, "../../../package.json");
  const sourceProjectArchPkg = await fs.readJSON(projectArchPkgPath);
  return String(sourceProjectArchPkg.version ?? "1.0.0");
}

function normalizePathForPackageJson(value: string): string {
  return value.split(path.sep).join("/");
}

async function getProjectArchDependencySpec(
  targetDir: string,
  consumerDir: string,
): Promise<string> {
  const localProjectArchPath = path.resolve(targetDir, "..", "packages", "project-arch");
  const localProjectArchPkgPath = path.join(localProjectArchPath, "package.json");
  if (await fs.pathExists(localProjectArchPkgPath)) {
    const localProjectArchPkg = await fs.readJSON(localProjectArchPkgPath);
    if (localProjectArchPkg.name === "project-arch") {
      const relative = path.relative(consumerDir, localProjectArchPath);
      return `link:${normalizePathForPackageJson(relative)}`;
    }
  }
  const projectArchVersion = await getProjectArchVersion();
  return `^${projectArchVersion}`;
}

function runCreateTurbo(projectName: string, options: CreateOptions): void {
  const args = [
    "--yes",
    "create-turbo@latest",
    projectName,
    "--package-manager",
    options.pm,
    "--skip-install",
  ];

  const result = spawnSync("npx", args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

async function runPaInit(targetDir: string, options: CreateOptions): Promise<void> {
  const { runCli } = await import("project-arch/cli");
  const argv = [
    "node",
    "pa",
    "init",
    "--template",
    options.template,
    "--apps",
    options.apps,
    "--pm",
    options.pm,
  ];

  if (options.withAi) {
    argv.push("--with-ai");
  }

  if (options.withDocsSite) {
    argv.push("--with-docs-site");
  }

  const previousCwd = process.cwd();
  process.chdir(targetDir);
  try {
    await runCli(argv);
  } finally {
    process.chdir(previousCwd);
  }
}

async function wireProjectArchUsage(targetDir: string): Promise<void> {
  const rootPackageJsonPath = path.join(targetDir, "package.json");
  if (!(await fs.pathExists(rootPackageJsonPath))) {
    throw new Error(`Missing generated package.json in ${targetDir}`);
  }

  const projectArchDependency = await getProjectArchDependencySpec(targetDir, targetDir);

  const pkg = await fs.readJSON(rootPackageJsonPath);
  const nextPkg = {
    ...pkg,
    scripts: {
      ...(pkg.scripts ?? {}),
      pa: "pa",
      "arch:check": "pa check",
      "arch:report": "pa report",
    },
    devDependencies: {
      ...(pkg.devDependencies ?? {}),
      "project-arch": projectArchDependency,
    },
  };

  await fs.writeJSON(rootPackageJsonPath, nextPkg, { spaces: 2 });
  await fs.appendFile(rootPackageJsonPath, "\n");
}

async function scaffoldArchitectureApps(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const archUiTemplate = path.join(templatesRoot, "arch-ui");
  const uiPackageTemplate = path.join(templatesRoot, "ui-package");
  const appsRoot = path.join(targetDir, "apps");
  const packagesRoot = path.join(targetDir, "packages");
  const archUiTarget = path.join(appsRoot, "arch");
  const uiPackageTarget = path.join(packagesRoot, "ui");

  if (!(await fs.pathExists(archUiTemplate))) {
    throw new Error(`Missing architecture app templates at ${templatesRoot}`);
  }
  if (!(await fs.pathExists(uiPackageTemplate))) {
    throw new Error(`Missing ui package templates at ${templatesRoot}`);
  }

  await fs.ensureDir(appsRoot);
  await fs.ensureDir(packagesRoot);
  await fs.copy(uiPackageTemplate, uiPackageTarget, { overwrite: true });
  await fs.copy(archUiTemplate, archUiTarget, { overwrite: true });

  const projectArchDependency = await getProjectArchDependencySpec(targetDir, archUiTarget);
  const archUiPkgPath = path.join(archUiTarget, "package.json");
  const archUiPkg = await fs.readJSON(archUiPkgPath);
  const nextArchUiPkg = {
    ...archUiPkg,
    dependencies: {
      ...(archUiPkg.dependencies ?? {}),
      "project-arch": projectArchDependency,
    },
  };
  await fs.writeJSON(archUiPkgPath, nextArchUiPkg, { spaces: 2 });
  await fs.appendFile(archUiPkgPath, "\n");
}

async function upsertArchModulesInMap(targetDir: string): Promise<void> {
  const modulesPath = path.join(targetDir, "arch-model", "modules.json");
  if (!(await fs.pathExists(modulesPath))) {
    return;
  }

  const existing = (await fs.readJSON(modulesPath)) as {
    modules?: Array<{ name?: string; type?: string; description?: string }>;
  };
  const currentModules = Array.isArray(existing.modules) ? existing.modules : [];
  const byName = new Map<string, { name: string; type: string; description: string }>();

  for (const moduleDef of currentModules) {
    if (!moduleDef || typeof moduleDef.name !== "string") {
      continue;
    }
    byName.set(moduleDef.name, {
      name: moduleDef.name,
      type: typeof moduleDef.type === "string" ? moduleDef.type : "application",
      description:
        typeof moduleDef.description === "string"
          ? moduleDef.description
          : "Module in the monorepo.",
    });
  }

  byName.set("apps/arch", {
    name: "apps/arch",
    type: "application",
    description: "Architecture control surface UI.",
  });
  byName.delete("apps/arch-api");

  const merged = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeJSON(modulesPath, { modules: merged }, { spaces: 2 });
  await fs.appendFile(modulesPath, "\n");
}

async function ensureTargetDir(targetDir: string, force: boolean): Promise<void> {
  if (!(await fs.pathExists(targetDir))) {
    return;
  }

  const entries = await fs.readdir(targetDir);
  if (entries.length === 0) {
    await fs.remove(targetDir);
    return;
  }

  if (!force) {
    throw new Error(`Target directory '${targetDir}' is not empty. Use --force to overwrite.`);
  }

  await fs.remove(targetDir);
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("create-project-arch")
    .description("Create a project-arch monorepo")
    .argument("<project-name>", "target directory name")
    .option("--template <name>", "template", "nextjs-turbo")
    .option("--apps <items>", "comma-separated apps", "web,docs")
    .option("--pm <name>", "package manager", "pnpm")
    .option("--with-ai", "create ai/indexing directory", false)
    .option("--with-docs-site", "create docs app (default: enabled)", true)
    .option("--force", "allow scaffolding in a non-empty target directory", false)
    .action(async (projectName: string, options: CreateOptions) => {
      if (projectName === "." || projectName === "./") {
        throw new Error(
          "Refusing to scaffold into current directory. Provide a new project directory name.",
        );
      }

      if (!/^[a-zA-Z0-9-_]+$/.test(projectName)) {
        throw new Error(
          "Invalid project name. Only alphanumeric characters, dashes, and underscores are allowed.",
        );
      }

      const targetDir = path.resolve(process.cwd(), projectName);
      await ensureTargetDir(targetDir, options.force);

      runCreateTurbo(projectName, options);

      // Ensure empty scaffolded packages have a .gitkeep so they are tracked by git
      const emptyPackages = ["api", "config", "database", "types"];
      for (const pkg of emptyPackages) {
        const pkgDir = path.join(targetDir, "packages", pkg);
        if (await fs.pathExists(pkgDir)) {
          const entries = await fs.readdir(pkgDir);
          if (entries.length === 0) {
            await fs.writeFile(path.join(pkgDir, ".gitkeep"), "");
          }
        }
      }

      await runPaInit(targetDir, options);
      await scaffoldArchitectureApps(targetDir);
      await upsertArchModulesInMap(targetDir);
      await wireProjectArchUsage(targetDir);

      const relativeTarget = path.relative(process.cwd(), targetDir) || ".";
      console.log(`\nCreated project-arch repo at ${relativeTarget}`);
      console.log("\nNext steps:");
      console.log(`  cd ${relativeTarget}`);
      console.log("  pnpm install");
      console.log("  pnpm arch:check");
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
