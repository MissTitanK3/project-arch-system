import fs from "fs-extra";
import { ensureDir, pathExists, writeJsonDeterministic } from "../../utils/fs";
import { assertSafeId } from "../../utils/safeId";
import { assertWithinRoot } from "../../utils/assertWithinRoot";
import {
  projectDir,
  projectDocsRoot,
  projectManifestPath,
  projectOverviewPath,
  projectPhasesRoot,
} from "../../utils/paths";
import { defaultProjectManifest, loadProjectManifest } from "../manifests";
import { assertSupportedRuntimeCompatibility } from "../runtime/compatibility";
import type { ProjectManifest } from "../../schemas/project";

async function assertInitialized(cwd = process.cwd()): Promise<void> {
  const docsRoot = projectDocsRoot(cwd);
  if (!(await pathExists(docsRoot))) {
    throw new Error("roadmap not found. Run 'pa init' first.");
  }
  await assertSupportedRuntimeCompatibility("Project creation", cwd);
}

function humanizeProjectId(projectId: string): string {
  return projectId
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function defaultOwnedPath(projectId: string): string {
  return `apps/${projectId}`;
}

function projectOverviewTemplate(manifest: ProjectManifest): string {
  const sharedDependencies =
    manifest.sharedDependencies.length > 0
      ? manifest.sharedDependencies.map((dependency) => `- ${dependency}`)
      : ["- None declared yet"];
  const tags =
    manifest.tags.length > 0 ? manifest.tags.map((tag) => `- ${tag}`) : ["- None declared yet"];

  return [
    `# ${manifest.title}`,
    "",
    manifest.summary,
    "",
    "## Project Type",
    "",
    manifest.type,
    "",
    "## Purpose",
    "",
    manifest.summary,
    "",
    "## Owned Paths",
    "",
    ...manifest.ownedPaths.map((ownedPath) => `- ${ownedPath}`),
    "",
    "## Shared Dependencies",
    "",
    ...sharedDependencies,
    "",
    "## Tags",
    "",
    ...tags,
    "",
    "## Delivery Notes",
    "",
    "- Create project-owned phases under `phases/` as implementation planning begins.",
    "- Keep project ownership boundaries stable and move cross-cutting work into `shared` when it is no longer specific to this project.",
    "",
  ].join("\n");
}

export async function createProject(
  input: {
    id: string;
    title?: string;
    type?: ProjectManifest["type"];
    summary?: string;
    ownedPaths?: string[];
    sharedDependencies?: string[];
    tags?: string[];
  },
  cwd = process.cwd(),
): Promise<ProjectManifest> {
  assertSafeId(input.id, "projectId");
  await assertInitialized(cwd);

  const projectPath = projectDir(input.id, cwd);
  assertWithinRoot(projectPath, cwd, "project directory");

  if (await pathExists(projectPath)) {
    throw new Error(`Project '${input.id}' already exists`);
  }

  const title = input.title?.trim() || humanizeProjectId(input.id);
  const summary = input.summary?.trim() || `${title} delivery project.`;
  const ownedPaths =
    input.ownedPaths && input.ownedPaths.length > 0
      ? input.ownedPaths.map((ownedPath) => ownedPath.trim())
      : [defaultOwnedPath(input.id)];
  const sharedDependencies = (input.sharedDependencies ?? []).map((dependency) => dependency.trim());
  const tags = (input.tags ?? []).map((tag) => tag.trim());

  const manifest = defaultProjectManifest(input.id, {
    title,
    type: input.type ?? "application",
    summary,
    ownedPaths,
    sharedDependencies,
    tags,
  });

  await ensureDir(projectPath);
  await ensureDir(projectPhasesRoot(input.id, cwd));
  await writeJsonDeterministic(projectManifestPath(input.id, cwd), manifest);
  await fs.writeFile(projectOverviewPath(input.id, cwd), projectOverviewTemplate(manifest), "utf8");

  return loadProjectManifest(input.id, cwd);
}
