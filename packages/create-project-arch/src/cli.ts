#!/usr/bin/env node
import path from "path";
import fs from "fs-extra";
import { spawnSync } from "child_process";
import { Command } from "commander";
import { validateProjectName } from "./projectNameValidation";

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

async function normalizeTurboSchema(targetDir: string): Promise<void> {
  const turboConfigPath = path.join(targetDir, "turbo.json");
  if (!(await fs.pathExists(turboConfigPath))) {
    return;
  }

  const turboConfig = (await fs.readJSON(turboConfigPath)) as {
    $schema?: string;
    globalEnv?: string[];
  };

  const existingGlobalEnv = Array.isArray(turboConfig.globalEnv)
    ? turboConfig.globalEnv.filter((entry) => typeof entry === "string")
    : [];
  const globalEnv = existingGlobalEnv.includes("PROJECT_ROOT")
    ? existingGlobalEnv
    : [...existingGlobalEnv, "PROJECT_ROOT"];

  await fs.writeJSON(
    turboConfigPath,
    {
      ...turboConfig,
      $schema: "./node_modules/turbo/schema.json",
      globalEnv,
    },
    { spaces: 2 },
  );
  await fs.appendFile(turboConfigPath, "\n");
}

function getAppReadmeContent(title: string, appDir: string): string {
  return [
    `# ${title}`,
    "",
    `This app lives in \`${appDir}\` and is part of the generated workspace.`,
    "",
    "## Getting Started",
    "",
    "Run from the repository root:",
    "",
    "```bash",
    `pnpm --filter ${appDir.split("/").pop()} dev`,
    "```",
    "",
    "Or run all apps in dev mode:",
    "",
    "```bash",
    "pnpm dev",
    "```",
    "",
  ].join("\n");
}

async function normalizeGeneratedAppReadmes(targetDir: string): Promise<void> {
  const readmeTargets: Array<{ readmePath: string; title: string; appDir: string }> = [
    {
      readmePath: path.join(targetDir, "apps", "web", "README.md"),
      title: "Web App",
      appDir: "apps/web",
    },
    {
      readmePath: path.join(targetDir, "apps", "docs", "README.md"),
      title: "Docs App",
      appDir: "apps/docs",
    },
  ];

  for (const target of readmeTargets) {
    if (!(await fs.pathExists(target.readmePath))) {
      continue;
    }

    await fs.writeFile(target.readmePath, getAppReadmeContent(target.title, target.appDir), "utf8");
  }
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

async function scaffoldFoundationDocs(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const foundationTemplateRoot = path.join(templatesRoot, "foundation");
  const foundationTargetRoot = path.join(targetDir, "architecture", "foundation");

  if (!(await fs.pathExists(foundationTemplateRoot))) {
    throw new Error(`Missing foundation templates at ${foundationTemplateRoot}`);
  }

  await fs.ensureDir(foundationTargetRoot);
  const foundationEntries = await fs.readdir(foundationTemplateRoot);

  for (const entry of foundationEntries) {
    const sourcePath = path.join(foundationTemplateRoot, entry);
    const targetPath = path.join(foundationTargetRoot, entry);

    if (await fs.pathExists(targetPath)) {
      continue;
    }

    await fs.copy(sourcePath, targetPath, { overwrite: false });
  }
}

async function scaffoldDomainSpecs(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const domainsTemplateRoot = path.join(templatesRoot, "domains");
  const domainsTargetRoot = path.join(targetDir, "arch-domains");

  if (!(await fs.pathExists(domainsTemplateRoot))) {
    throw new Error(`Missing domain templates at ${domainsTemplateRoot}`);
  }

  await fs.ensureDir(domainsTargetRoot);
  const domainEntries = await fs.readdir(domainsTemplateRoot);

  for (const entry of domainEntries) {
    const sourcePath = path.join(domainsTemplateRoot, entry);
    const targetPath = path.join(domainsTargetRoot, entry);

    if (entry === "DOMAIN_TEMPLATE.md" || entry === "README.md") {
      await fs.copy(sourcePath, targetPath, { overwrite: true });
      continue;
    }

    if (entry === "domains.json") {
      if (await fs.pathExists(targetPath)) {
        const existing = (await fs.readJSON(targetPath)) as { domains?: unknown };
        if (Array.isArray(existing.domains) && existing.domains.length > 0) {
          continue;
        }
      }

      await fs.copy(sourcePath, targetPath, { overwrite: true });
      continue;
    }

    if (await fs.pathExists(targetPath)) {
      continue;
    }

    await fs.copy(sourcePath, targetPath, { overwrite: false });
  }
}

async function scaffoldArchitectureSpecs(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const architectureSpecsTemplateRoot = path.join(templatesRoot, "architecture-specs");
  const architectureSpecsTargetRoot = path.join(targetDir, "architecture", "architecture");

  if (!(await fs.pathExists(architectureSpecsTemplateRoot))) {
    throw new Error(`Missing architecture spec templates at ${architectureSpecsTemplateRoot}`);
  }

  await fs.ensureDir(architectureSpecsTargetRoot);
  const specEntries = await fs.readdir(architectureSpecsTemplateRoot);

  for (const entry of specEntries) {
    const sourcePath = path.join(architectureSpecsTemplateRoot, entry);
    const targetPath = path.join(architectureSpecsTargetRoot, entry);

    if (await fs.pathExists(targetPath)) {
      continue;
    }

    await fs.copy(sourcePath, targetPath, { overwrite: false });
  }
}

async function scaffoldConceptMap(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const conceptMapTemplatePath = path.join(templatesRoot, "concept-map", "concept-map.json");
  const conceptMapTargetPath = path.join(targetDir, "arch-model", "concept-map.json");

  if (!(await fs.pathExists(conceptMapTemplatePath))) {
    throw new Error(`Missing concept-map template at ${conceptMapTemplatePath}`);
  }

  await fs.ensureDir(path.dirname(conceptMapTargetPath));
  if (await fs.pathExists(conceptMapTargetPath)) {
    return;
  }

  await fs.copy(conceptMapTemplatePath, conceptMapTargetPath, { overwrite: false });
}

async function scaffoldDecisionRecords(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const decisionsTemplateRoot = path.join(templatesRoot, "decisions");
  const decisionsTargetRoot = path.join(targetDir, "architecture", "decisions");

  if (!(await fs.pathExists(decisionsTemplateRoot))) {
    throw new Error(`Missing decision templates at ${decisionsTemplateRoot}`);
  }

  await fs.ensureDir(decisionsTargetRoot);
  const entries = await fs.readdir(decisionsTemplateRoot);

  for (const entry of entries) {
    const sourcePath = path.join(decisionsTemplateRoot, entry);
    const targetPath = path.join(decisionsTargetRoot, entry);

    if (await fs.pathExists(targetPath)) {
      continue;
    }

    await fs.copy(sourcePath, targetPath, { overwrite: false });
  }
}

async function scaffoldGapClosureTemplates(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const gapClosureTemplateRoot = path.join(templatesRoot, "gap-closure");
  const gapClosureTargetRoot = path.join(targetDir, "architecture", "reference");

  if (!(await fs.pathExists(gapClosureTemplateRoot))) {
    throw new Error(`Missing gap-closure templates at ${gapClosureTemplateRoot}`);
  }

  await fs.ensureDir(gapClosureTargetRoot);
  const entries = await fs.readdir(gapClosureTemplateRoot);

  for (const entry of entries) {
    const sourcePath = path.join(gapClosureTemplateRoot, entry);
    const targetPath = path.join(gapClosureTargetRoot, entry);

    if (await fs.pathExists(targetPath)) {
      continue;
    }

    await fs.copy(sourcePath, targetPath, { overwrite: false });
  }
}

async function scaffoldValidationHooks(targetDir: string): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const validationTemplateRoot = path.join(templatesRoot, "validation-hooks");

  if (!(await fs.pathExists(validationTemplateRoot))) {
    throw new Error(`Missing validation hook templates at ${validationTemplateRoot}`);
  }

  const entries = await fs.readdir(validationTemplateRoot);
  for (const entry of entries) {
    const sourcePath = path.join(validationTemplateRoot, entry);
    const targetPath = path.join(targetDir, entry);
    await copyMissingEntries(sourcePath, targetPath);
  }
}

async function copyMissingEntries(sourcePath: string, targetPath: string): Promise<void> {
  const sourceStats = await fs.stat(sourcePath);

  if (!sourceStats.isDirectory()) {
    if (!(await fs.pathExists(targetPath))) {
      await fs.copy(sourcePath, targetPath, { overwrite: false });
    }
    return;
  }

  await fs.ensureDir(targetPath);
  const children = await fs.readdir(sourcePath);
  for (const child of children) {
    await copyMissingEntries(path.join(sourcePath, child), path.join(targetPath, child));
  }
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

      validateProjectName(projectName);

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
      await scaffoldFoundationDocs(targetDir);
      await scaffoldDomainSpecs(targetDir);
      await scaffoldArchitectureSpecs(targetDir);
      await scaffoldConceptMap(targetDir);
      await scaffoldDecisionRecords(targetDir);
      await scaffoldGapClosureTemplates(targetDir);
      await scaffoldValidationHooks(targetDir);
      await scaffoldArchitectureApps(targetDir);
      await upsertArchModulesInMap(targetDir);
      await wireProjectArchUsage(targetDir);
      await normalizeTurboSchema(targetDir);
      await normalizeGeneratedAppReadmes(targetDir);

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
