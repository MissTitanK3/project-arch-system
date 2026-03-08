import path from "node:path";
import { readdir } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { ArchitectureMapData } from "./types";
import {
  GRAPH_SCHEMA_VERSION,
  GraphDataset,
  GraphEdge,
  GraphNode,
  validateGraphDataset,
} from "./graph-schema";

const execFile = promisify(execFileCb);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function collectMarkdownFiles(root: string, relativeDir: string): Promise<string[]> {
  const directory = path.join(root, relativeDir);
  const result: string[] = [];

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".md")) continue;
      result.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }

  try {
    await walk(directory);
  } catch {
    return [];
  }

  return result.sort((a, b) => a.localeCompare(b));
}

async function listImmediateDirectories(root: string, relativeDir: string): Promise<string[]> {
  const full = path.join(root, relativeDir);
  try {
    const entries = await readdir(full, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${relativeDir}/${entry.name}`.split(path.sep).join("/"))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function walkDirectories(
  root: string,
  relativeDir: string,
  onDirectory: (relativePath: string, parentRelativePath: string | null) => Promise<void> | void,
  maxDepth = 6,
): Promise<void> {
  const start = path.join(root, relativeDir);

  async function walk(currentRelative: string, parentRelative: string | null, depth: number) {
    if (depth > maxDepth) return;
    await onDirectory(currentRelative, parentRelative);

    const full = path.join(root, currentRelative);
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(full, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const nextRelative = `${currentRelative}/${entry.name}`.split(path.sep).join("/");
      await walk(nextRelative, currentRelative, depth + 1);
    }
  }

  await walk(relativeDir, null, 0);
}

function ensureNode(nodes: GraphNode[], node: GraphNode) {
  if (nodes.some((candidate) => candidate.id === node.id)) return;
  nodes.push(node);
}

function ensureEdge(edges: GraphEdge[], edge: GraphEdge) {
  if (edges.some((candidate) => candidate.id === edge.id)) return;
  edges.push(edge);
}

async function filterGitIgnoredPaths(root: string, paths: string[]): Promise<Set<string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Set();

  const ignored = new Set<string>();
  const chunkSize = 200;

  try {
    for (let index = 0; index < unique.length; index += chunkSize) {
      const chunk = unique.slice(index, index + chunkSize);
      if (chunk.length === 0) continue;

      try {
        const { stdout } = (await execFile("git", ["check-ignore", ...chunk], {
          cwd: root,
          encoding: "utf8",
        } as Parameters<typeof execFile>[2])) as { stdout: string };
        stdout
          .split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean)
          .forEach((value) => ignored.add(value));
      } catch (error) {
        const details = error as { code?: number; stdout?: string };
        // `git check-ignore` exits 1 when no path from this chunk is ignored.
        if (details.code !== 1) {
          throw error;
        }
        const chunkStdout = typeof details.stdout === "string" ? details.stdout : "";
        chunkStdout
          .split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean)
          .forEach((value) => ignored.add(value));
      }
    }
    return ignored;
  } catch (error) {
    // If git is unavailable or command fails unexpectedly, do not block graph generation.
    return new Set();
  }
}

function scopeForProjectPath(relativePath: string): "apps" | "packages" {
  return relativePath.startsWith("packages/") ? "packages" : "apps";
}

export async function buildGraphDatasetFromArchitectureMap(
  root: string,
  data: ArchitectureMapData,
): Promise<GraphDataset> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const domainId = new Map<string, string>();
  const modelId = new Map<string, string>();
  const phaseId = new Map<string, string>();
  const storyId = new Map<string, string>();
  const taskId = new Map<string, string>();
  const projectNodeId = new Map<string, string>();

  const archRootId = "arch:folder:root";
  const archDomainFolderId = "arch:folder:domain-docs";
  const archDocsFolderId = "arch:folder:architecture-docs";
  const archModelFolderId = "arch:folder:arch-model";

  ensureNode(nodes, {
    id: archRootId,
    type: "arch_folder",
    title: "Architecture",
    views: ["architecture-map"],
    source: { path: "architecture", scope: "architecture" },
    metadata: { level: "root" },
  });
  ensureNode(nodes, {
    id: archDomainFolderId,
    type: "arch_folder",
    title: "Domain Docs",
    views: ["architecture-map"],
    source: { path: "arch-domains", scope: "arch-domains" },
    metadata: { level: "group" },
  });
  ensureNode(nodes, {
    id: archDocsFolderId,
    type: "arch_folder",
    title: "Architecture Docs",
    views: ["architecture-map"],
    source: { path: "architecture", scope: "architecture" },
    metadata: { level: "group" },
  });
  ensureNode(nodes, {
    id: archModelFolderId,
    type: "arch_folder",
    title: "Arch Model",
    views: ["architecture-map"],
    source: { path: "arch-model", scope: "arch-model" },
    metadata: { level: "group" },
  });

  ensureEdge(edges, {
    id: `contains:${archRootId}:${archDomainFolderId}`,
    type: "contains",
    source: archRootId,
    target: archDomainFolderId,
    authority: "authoritative",
  });
  ensureEdge(edges, {
    id: `contains:${archRootId}:${archDocsFolderId}`,
    type: "contains",
    source: archRootId,
    target: archDocsFolderId,
    authority: "authoritative",
  });
  ensureEdge(edges, {
    id: `contains:${archRootId}:${archModelFolderId}`,
    type: "contains",
    source: archRootId,
    target: archModelFolderId,
    authority: "authoritative",
  });

  data.nodes.domains.forEach((domain) => {
    const id = `arch:domain:${slugify(domain.name)}`;
    domainId.set(domain.name, id);
    ensureNode(nodes, {
      id,
      type: "domain_doc",
      title: domain.name,
      description: domain.description,
      views: ["architecture-map"],
      source: {
        path: `arch-domains/domains.json#${domain.name}`,
        scope: "arch-domains",
      },
      metadata: {
        domain: domain.name,
      },
    });
    ensureEdge(edges, {
      id: `contains:${archDomainFolderId}:${id}`,
      type: "contains",
      source: archDomainFolderId,
      target: id,
      authority: "authoritative",
    });
  });

  const architectureDocs = await collectMarkdownFiles(root, "architecture");
  const archPathFolder = new Map<string, string>();
  archPathFolder.set("architecture", archDocsFolderId);

  architectureDocs.forEach((docPath) => {
    const parts = docPath.split("/");
    let prefix = "architecture";
    let parentFolderId = archDocsFolderId;

    for (let i = 1; i < parts.length - 1; i++) {
      prefix = `${prefix}/${parts[i]}`;
      let folderId = archPathFolder.get(prefix);
      if (!folderId) {
        folderId = `arch:folder:${slugify(prefix)}`;
        archPathFolder.set(prefix, folderId);
        ensureNode(nodes, {
          id: folderId,
          type: "arch_folder",
          title: parts[i] ?? prefix,
          views: ["architecture-map"],
          source: { path: prefix, scope: "architecture" },
          metadata: { level: "path" },
        });
        ensureEdge(edges, {
          id: `contains:${parentFolderId}:${folderId}`,
          type: "contains",
          source: parentFolderId,
          target: folderId,
          authority: "authoritative",
        });
      }
      parentFolderId = folderId;
    }

    const id = `arch:doc:${slugify(docPath.replace(/\.md$/i, ""))}`;
    ensureNode(nodes, {
      id,
      type: "architecture_doc",
      title: docPath.split("/").pop()?.replace(/\.md$/i, "") ?? docPath,
      views: ["architecture-map"],
      source: {
        path: docPath,
        scope: "architecture",
      },
      metadata: {
        file: docPath,
      },
    });
    ensureEdge(edges, {
      id: `contains:${parentFolderId}:${id}`,
      type: "contains",
      source: parentFolderId,
      target: id,
      authority: "authoritative",
    });
  });

  data.nodes.decisions.forEach((decision) => {
    const id = `arch:model:${slugify(decision.id)}`;
    modelId.set(decision.id, id);
    ensureNode(nodes, {
      id,
      type: "architecture_model",
      title: decision.title ?? decision.id,
      description: decision.status,
      views: ["architecture-map"],
      source: {
        path: `roadmap/decisions/index.json#${decision.id}`,
        scope: "roadmap",
      },
      metadata: {
        decisionId: decision.id,
        status: decision.status ?? "open",
      },
    });
    ensureEdge(edges, {
      id: `contains:${archModelFolderId}:${id}`,
      type: "contains",
      source: archModelFolderId,
      target: id,
      authority: "authoritative",
    });
  });

  const roadmapRootId = "roadmap:folder:root";
  ensureNode(nodes, {
    id: roadmapRootId,
    type: "roadmap_folder",
    title: "Roadmap",
    views: ["tasks"],
    source: { path: "roadmap", scope: "roadmap" },
    metadata: { level: "root" },
  });

  const uniquePhases = [...new Set(data.nodes.milestones.map((milestone) => milestone.phaseId))];
  uniquePhases.forEach((phase) => {
    const folderId = `roadmap:folder:${slugify(phase)}`;
    ensureNode(nodes, {
      id: folderId,
      type: "roadmap_folder",
      title: phase,
      views: ["tasks"],
      source: { path: `roadmap/phases/${phase}`, scope: "roadmap" },
      metadata: { level: "group" },
    });
    ensureEdge(edges, {
      id: `contains:${roadmapRootId}:${folderId}`,
      type: "contains",
      source: roadmapRootId,
      target: folderId,
      authority: "authoritative",
    });

    const id = `roadmap:epic:${slugify(phase)}`;
    phaseId.set(phase, id);
    ensureNode(nodes, {
      id,
      type: "roadmap_epic",
      title: phase,
      views: ["tasks"],
      source: {
        path: `roadmap/phases/${phase}`,
        scope: "roadmap",
      },
      metadata: {
        phase,
      },
    });

    ensureEdge(edges, {
      id: `contains:${folderId}:${id}`,
      type: "contains",
      source: folderId,
      target: id,
      authority: "authoritative",
    });
  });

  data.nodes.milestones.forEach((milestone) => {
    const phaseFolderId = `roadmap:folder:${slugify(milestone.phaseId)}`;
    const milestoneFolderId = `roadmap:folder:${slugify(milestone.id)}`;

    ensureNode(nodes, {
      id: milestoneFolderId,
      type: "roadmap_folder",
      title: milestone.id,
      views: ["tasks"],
      source: {
        path: `roadmap/phases/${milestone.phaseId}/milestones/${milestone.milestoneId}`,
        scope: "roadmap",
      },
      metadata: { level: "path" },
    });
    ensureEdge(edges, {
      id: `contains:${phaseFolderId}:${milestoneFolderId}`,
      type: "contains",
      source: phaseFolderId,
      target: milestoneFolderId,
      authority: "authoritative",
    });

    const id = `roadmap:story:${slugify(milestone.id)}`;
    storyId.set(milestone.id, id);
    ensureNode(nodes, {
      id,
      type: "roadmap_story",
      title: milestone.id,
      views: ["tasks"],
      source: {
        path: `roadmap/phases/${milestone.phaseId}/milestones/${milestone.milestoneId}`,
        scope: "roadmap",
      },
      metadata: {
        phaseId: milestone.phaseId,
        milestoneId: milestone.milestoneId,
      },
    });
    ensureEdge(edges, {
      id: `contains:${milestoneFolderId}:${id}`,
      type: "contains",
      source: milestoneFolderId,
      target: id,
      authority: "authoritative",
    });

    const parentPhase = phaseId.get(milestone.phaseId);
    if (parentPhase) {
      ensureEdge(edges, {
        id: `contains:${parentPhase}:${id}`,
        type: "contains",
        source: parentPhase,
        target: id,
        authority: "authoritative",
      });
    }
  });

  data.nodes.tasks.forEach((task) => {
    const id = `roadmap:task:${slugify(task.id)}`;
    taskId.set(task.id, id);
    ensureNode(nodes, {
      id,
      type: "roadmap_task",
      title: task.title,
      views: ["tasks"],
      source: {
        path: `roadmap/phases/${task.id}`,
        scope: "roadmap",
      },
      metadata: {
        taskId: task.id,
        milestone: task.milestone,
        status: task.status,
        lane: task.lane,
        domain: task.domain ?? "unassigned",
      },
    });

    const milestoneFolderId = `roadmap:folder:${slugify(task.milestone)}`;
    ensureEdge(edges, {
      id: `contains:${milestoneFolderId}:${id}`,
      type: "contains",
      source: milestoneFolderId,
      target: id,
      authority: "authoritative",
    });
  });

  const projectRootId = "project:folder:root";
  const appsRootId = "project:folder:apps";
  const packagesRootId = "project:folder:packages";

  ensureNode(nodes, {
    id: projectRootId,
    type: "project_folder",
    title: "Project",
    views: ["project"],
    source: { path: ".", scope: "apps" },
    metadata: { level: "root" },
  });
  ensureNode(nodes, {
    id: appsRootId,
    type: "project_folder",
    title: "apps",
    views: ["project"],
    source: { path: "apps", scope: "apps" },
    metadata: { level: "group" },
  });
  ensureNode(nodes, {
    id: packagesRootId,
    type: "project_folder",
    title: "packages",
    views: ["project"],
    source: { path: "packages", scope: "packages" },
    metadata: { level: "group" },
  });
  ensureEdge(edges, {
    id: `contains:${projectRootId}:${appsRootId}`,
    type: "contains",
    source: projectRootId,
    target: appsRootId,
    authority: "authoritative",
  });
  ensureEdge(edges, {
    id: `contains:${projectRootId}:${packagesRootId}`,
    type: "contains",
    source: projectRootId,
    target: packagesRootId,
    authority: "authoritative",
  });

  projectNodeId.set("apps", appsRootId);
  projectNodeId.set("packages", packagesRootId);

  const appDirs = await listImmediateDirectories(root, "apps");
  for (const appPath of appDirs) {
    const appSlug = appPath.split("/")[1] ?? appPath;
    const appNodeId = `project:app:${slugify(appSlug)}`;
    projectNodeId.set(appPath, appNodeId);
    ensureNode(nodes, {
      id: appNodeId,
      type: "app",
      title: appSlug,
      views: ["project"],
      source: { path: appPath, scope: "apps" },
      metadata: { app: appSlug },
    });
    ensureEdge(edges, {
      id: `contains:${appsRootId}:${appNodeId}`,
      type: "contains",
      source: appsRootId,
      target: appNodeId,
      authority: "authoritative",
    });

    await walkDirectories(root, appPath, (relativePath, parentRelativePath) => {
      if (relativePath === appPath) return;
      const folderId = `project:folder:${slugify(relativePath)}`;
      projectNodeId.set(relativePath, folderId);
      ensureNode(nodes, {
        id: folderId,
        type: "project_folder",
        title: relativePath.split("/").pop() ?? relativePath,
        views: ["project"],
        source: { path: relativePath, scope: scopeForProjectPath(relativePath) },
        metadata: { level: "path" },
      });

      const parentId = parentRelativePath ? projectNodeId.get(parentRelativePath) : appNodeId;
      ensureEdge(edges, {
        id: `contains:${parentId ?? appNodeId}:${folderId}`,
        type: "contains",
        source: parentId ?? appNodeId,
        target: folderId,
        authority: "authoritative",
      });
    });
  }

  const packageDirs = await listImmediateDirectories(root, "packages");
  for (const packagePath of packageDirs) {
    const packageSlug = packagePath.split("/")[1] ?? packagePath;
    const packageNodeId = `project:package:${slugify(packageSlug)}`;
    projectNodeId.set(packagePath, packageNodeId);
    ensureNode(nodes, {
      id: packageNodeId,
      type: "package",
      title: packageSlug,
      views: ["project"],
      source: { path: packagePath, scope: "packages" },
      metadata: { package: packageSlug },
    });
    ensureEdge(edges, {
      id: `contains:${packagesRootId}:${packageNodeId}`,
      type: "contains",
      source: packagesRootId,
      target: packageNodeId,
      authority: "authoritative",
    });

    await walkDirectories(root, packagePath, (relativePath, parentRelativePath) => {
      if (relativePath === packagePath) return;
      const folderId = `project:folder:${slugify(relativePath)}`;
      projectNodeId.set(relativePath, folderId);
      ensureNode(nodes, {
        id: folderId,
        type: "project_folder",
        title: relativePath.split("/").pop() ?? relativePath,
        views: ["project"],
        source: { path: relativePath, scope: scopeForProjectPath(relativePath) },
        metadata: { level: "path" },
      });

      const parentId = parentRelativePath ? projectNodeId.get(parentRelativePath) : packageNodeId;
      ensureEdge(edges, {
        id: `contains:${parentId ?? packageNodeId}:${folderId}`,
        type: "contains",
        source: parentId ?? packageNodeId,
        target: folderId,
        authority: "authoritative",
      });
    });
  }

  data.nodes.modules.forEach((moduleRef) => {
    const normalized = moduleRef.name.split(path.sep).join("/");

    // Avoid duplicate semantic nodes like app "docs" + module "apps/docs".
    if (projectNodeId.has(normalized)) {
      return;
    }

    const parts = normalized.split("/");
    const rootScope = parts[0] === "packages" ? "packages" : "apps";
    const isComponent = /\.(tsx|jsx)$/i.test(normalized) || normalized.includes("/components/");
    const nodeType = isComponent ? "component" : "module";
    const childId = `project:${nodeType}:${slugify(normalized)}`;
    projectNodeId.set(moduleRef.name, childId);

    ensureNode(nodes, {
      id: childId,
      type: nodeType,
      title: moduleRef.name,
      description: moduleRef.description,
      views: ["project"],
      source: {
        path: moduleRef.name,
        scope: rootScope,
      },
      metadata: {
        moduleType: moduleRef.type ?? "module",
      },
    });

    const parentPath = normalized.includes("/")
      ? normalized.slice(0, normalized.lastIndexOf("/"))
      : rootScope;

    let parentId = projectNodeId.get(parentPath);
    if (!parentId) {
      const rootParent = rootScope === "packages" ? packagesRootId : appsRootId;
      parentId = rootParent;
    }

    ensureEdge(edges, {
      id: `contains:${parentId}:${childId}`,
      type: "contains",
      source: parentId,
      target: childId,
      authority: "authoritative",
    });
  });

  data.edges.milestoneToTask.forEach((edge) => {
    const source = storyId.get(edge.milestone);
    const target = taskId.get(edge.task);
    if (!source || !target) return;
    ensureEdge(edges, {
      id: `contains:${source}:${target}`,
      type: "contains",
      source,
      target,
      authority: "authoritative",
    });
  });

  data.edges.taskToDecision.forEach((edge) => {
    const source = taskId.get(edge.task);
    const target = modelId.get(edge.decision);
    if (!source || !target) return;
    ensureEdge(edges, {
      id: `references:${source}:${target}`,
      type: "references",
      source,
      target,
      authority: "authoritative",
    });
  });

  data.edges.taskToModule.forEach((edge) => {
    const source = projectNodeId.get(edge.module);
    const target = taskId.get(edge.task);
    if (!source || !target) return;
    ensureEdge(edges, {
      id: `implements:${source}:${target}`,
      type: "implements",
      source,
      target,
      authority: "authoritative",
    });
  });

  data.edges.decisionToDomain.forEach((edge) => {
    const source = modelId.get(edge.decision);
    const target = domainId.get(edge.domain);
    if (!source || !target) return;
    ensureEdge(edges, {
      id: `references:${source}:${target}`,
      type: "references",
      source,
      target,
      authority: "authoritative",
    });
  });

  const sourcePathByNodeId = new Map<string, string>();
  nodes.forEach((node) => {
    const sourcePath = node.source.path.split("#")[0]?.trim() ?? "";
    sourcePathByNodeId.set(node.id, sourcePath);
  });

  const ignoredPaths = await filterGitIgnoredPaths(
    root,
    [...sourcePathByNodeId.values()].filter((value) => value !== "." && value.length > 0),
  );

  const filteredNodes = nodes.filter((node) => {
    const sourcePath = sourcePathByNodeId.get(node.id) ?? "";
    if (!sourcePath || sourcePath === ".") return true;
    return !ignoredPaths.has(sourcePath);
  });
  const allowedNodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter(
    (edge) => allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target),
  );

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

export async function buildValidatedGraphDataset(root: string, data: ArchitectureMapData) {
  const dataset = await buildGraphDatasetFromArchitectureMap(root, data);
  const validation = validateGraphDataset(dataset);
  return {
    dataset,
    validation,
  };
}
