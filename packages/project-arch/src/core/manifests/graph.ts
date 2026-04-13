import path from "path";
import fg from "fast-glob";
import { decisionSchema } from "../../schemas/decision";
import { taskSchema } from "../../schemas/task";
import {
  ensureDir,
  pathExists,
  readJson,
  readMarkdownWithFrontmatter,
  writeJsonDeterministicIfChanged,
} from "../../utils/fs";
import {
  classifyModuleTarget,
  loadModuleGraphConfig,
  type ModuleLayer,
} from "../../graph/moduleClassification";
import { filterGlobPathsBySymlinkPolicy } from "../../utils/symlinkPolicy";

interface DomainSpec {
  name: string;
  ownedPackages: string[];
  ownedFeatures: string[];
}

interface ModuleNode {
  name: string;
  type: string;
  description: string;
  layer: ModuleLayer;
  confidence: "declared" | "inferred";
}

interface TaskNode {
  id: string;
  title: string;
  milestone: string;
  domain: string | null;
  status: string;
  lane: string;
}

interface DecisionNode {
  id: string;
  title: string;
  status: string;
  scope: string;
}

interface MilestoneNode {
  id: string;
  phaseId: string;
  milestoneId: string;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function parseMilestoneFromTaskPath(taskPath: string): { phaseId: string; milestoneId: string } {
  const normalized = normalizePath(taskPath);
  const match =
    normalized.match(
      /roadmap\/projects\/[^/]+\/phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/[^/]+\/[^/]+\.md$/,
    ) ??
    normalized.match(/roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/[^/]+\/[^/]+\.md$/);
  if (!match) {
    throw new Error(`Unexpected task path: ${taskPath}`);
  }
  return { phaseId: match[1], milestoneId: match[2] };
}

function parseMilestoneFromManifestPath(manifestPath: string): {
  phaseId: string;
  milestoneId: string;
} {
  const normalized = normalizePath(manifestPath);
  const match =
    normalized.match(
      /roadmap\/projects\/[^/]+\/phases\/([^/]+)\/milestones\/([^/]+)\/manifest\.json$/,
    ) ??
    normalized.match(/roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/manifest\.json$/);
  if (!match) {
    throw new Error(`Unexpected milestone manifest path: ${manifestPath}`);
  }
  return { phaseId: match[1], milestoneId: match[2] };
}

function isCanonicalRoadmapPath(filePath: string): boolean {
  return normalizePath(filePath).includes("/roadmap/projects/");
}

export type GraphLayerMode = "runtime" | "all";

function inferDomainForTask(
  tags: string[],
  slug: string,
  codeTargets: string[],
  domains: DomainSpec[],
): string | null {
  const loweredTags = tags.map((tag) => tag.toLowerCase());
  const loweredSlug = slug.toLowerCase();
  for (const domain of domains) {
    if (loweredTags.includes(domain.name.toLowerCase())) {
      return domain.name;
    }
  }
  for (const domain of domains) {
    const featureHit = domain.ownedFeatures.some((feature) => {
      const token = feature.toLowerCase();
      return loweredTags.includes(token) || loweredSlug.includes(token);
    });
    if (featureHit) {
      return domain.name;
    }
  }
  for (const domain of domains) {
    const packageHit = codeTargets.some((target) =>
      domain.ownedPackages.some((ownedPackage) =>
        normalizePath(target).startsWith(`${normalizePath(ownedPackage)}/`),
      ),
    );
    if (packageHit) {
      return domain.name;
    }
  }
  return null;
}

function inferDomainsForDecision(
  decisionCodeTargets: string[],
  linkedTaskRefs: string[],
  taskDomainByRef: Map<string, string | null>,
  domains: DomainSpec[],
): string[] {
  const inferred = new Set<string>();
  for (const taskRef of linkedTaskRefs) {
    const taskDomain = taskDomainByRef.get(taskRef);
    if (taskDomain) {
      inferred.add(taskDomain);
    }
  }
  for (const domain of domains) {
    const packageHit = decisionCodeTargets.some((target) =>
      domain.ownedPackages.some((ownedPackage) =>
        normalizePath(target).startsWith(`${normalizePath(ownedPackage)}/`),
      ),
    );
    if (packageHit) {
      inferred.add(domain.name);
    }
  }
  return [...inferred].sort((a, b) => a.localeCompare(b));
}

export async function rebuildArchitectureGraph(
  cwd = process.cwd(),
  options: { write?: boolean; layerMode?: GraphLayerMode } = {},
): Promise<void> {
  const layerMode: GraphLayerMode = options.layerMode === "all" ? "all" : "runtime";
  const graphConfig = await loadModuleGraphConfig(cwd);

  const archRoot = path.join(cwd, ".arch");
  const nodesRoot = path.join(archRoot, "nodes");
  const edgesRoot = path.join(archRoot, "edges");

  const domainsPath = path.join(cwd, "arch-domains", "domains.json");
  const domainsData = (await pathExists(domainsPath))
    ? await readJson<{ domains?: unknown }>(domainsPath)
    : { domains: [] };
  const domains: DomainSpec[] = Array.isArray(domainsData.domains)
    ? domainsData.domains
        .filter(
          (item): item is { name: string; ownedPackages?: unknown; ownedFeatures?: unknown } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as { name?: unknown }).name === "string",
        )
        .map((item) => ({
          name: item.name,
          ownedPackages: Array.isArray(item.ownedPackages)
            ? item.ownedPackages.filter((value): value is string => typeof value === "string")
            : [],
          ownedFeatures: Array.isArray(item.ownedFeatures)
            ? item.ownedFeatures.filter((value): value is string => typeof value === "string")
            : [],
        }))
    : [];

  const aiMapModulesPath = path.join(cwd, "arch-model", "modules.json");
  const aiMapModules = (await pathExists(aiMapModulesPath))
    ? await readJson<{ modules?: unknown }>(aiMapModulesPath)
    : { modules: [] };
  const moduleNodesFromMap: ModuleNode[] = Array.isArray(aiMapModules.modules)
    ? aiMapModules.modules
        .filter(
          (
            item,
          ): item is { name: string; type?: unknown; description?: unknown; layer?: unknown } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as { name?: unknown }).name === "string",
        )
        .map((item) => ({
          name: item.name,
          type: typeof item.type === "string" ? item.type : "unknown",
          description: typeof item.description === "string" ? item.description : "",
          layer:
            item.layer === "runtime" ||
            item.layer === "docs" ||
            item.layer === "generated" ||
            item.layer === "infra"
              ? item.layer
              : "runtime",
          confidence: "declared",
        }))
    : [];

  const taskFiles = await fg(
    [
      "roadmap/projects/*/phases/*/milestones/*/tasks/*/*.md",
      "roadmap/phases/*/milestones/*/tasks/*/*.md",
    ],
    {
    cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    },
  );
  const decisionFiles = await fg(["roadmap/decisions/**/*.md", "!roadmap/decisions/**/index.md"], {
    cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  const milestoneManifestFiles = await fg(
    [
      "roadmap/projects/*/phases/*/milestones/*/manifest.json",
      "roadmap/phases/*/milestones/*/manifest.json",
    ],
    {
    cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    },
  );

  const safeTaskFiles = await filterGlobPathsBySymlinkPolicy(taskFiles, cwd, {
    pathsAreAbsolute: true,
  });
  const safeDecisionFiles = await filterGlobPathsBySymlinkPolicy(decisionFiles, cwd, {
    pathsAreAbsolute: true,
  });
  const safeMilestoneManifestFiles = await filterGlobPathsBySymlinkPolicy(
    milestoneManifestFiles,
    cwd,
    {
      pathsAreAbsolute: true,
    },
  );

  const taskNodes: TaskNode[] = [];
  const decisionNodes: DecisionNode[] = [];
  const milestoneNodes: MilestoneNode[] = [];

  const milestoneToTaskEdges: Array<{ milestone: string; task: string }> = [];
  const taskToDecisionEdges: Array<{ task: string; decision: string }> = [];
  const taskToModuleEdges: Array<{ task: string; module: string }> = [];
  const decisionToDomainEdges: Array<{ decision: string; domain: string }> = [];

  const taskDomainByRef = new Map<string, string | null>();
  const knownDecisionIds = new Set<string>();
  const moduleNodeByName = new Map<string, ModuleNode>(
    moduleNodesFromMap.map((moduleNode) => [moduleNode.name, moduleNode]),
  );

  const milestoneManifestByRef = new Map<string, string>();
  for (const manifestPath of safeMilestoneManifestFiles.sort()) {
    const { phaseId, milestoneId } = parseMilestoneFromManifestPath(manifestPath);
    const milestoneRef = `${phaseId}/${milestoneId}`;
    const existing = milestoneManifestByRef.get(milestoneRef);
    if (!existing || (isCanonicalRoadmapPath(manifestPath) && !isCanonicalRoadmapPath(existing))) {
      milestoneManifestByRef.set(milestoneRef, manifestPath);
    }
  }

  for (const milestoneRef of [...milestoneManifestByRef.keys()].sort((a, b) => a.localeCompare(b))) {
    const [phaseId, milestoneId] = milestoneRef.split("/");
    milestoneNodes.push({ id: milestoneRef, phaseId, milestoneId });
  }

  const taskFileByRef = new Map<string, string>();
  for (const taskFile of safeTaskFiles.sort()) {
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    const parsed = taskSchema.parse(data);
    const { phaseId, milestoneId } = parseMilestoneFromTaskPath(taskFile);
    const taskRef = `${phaseId}/${milestoneId}/${parsed.id}`;
    const existing = taskFileByRef.get(taskRef);
    if (!existing || (isCanonicalRoadmapPath(taskFile) && !isCanonicalRoadmapPath(existing))) {
      taskFileByRef.set(taskRef, taskFile);
    }
  }

  for (const taskRef of [...taskFileByRef.keys()].sort((a, b) => a.localeCompare(b))) {
    const taskFile = taskFileByRef.get(taskRef);
    if (!taskFile) {
      continue;
    }
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    const parsed = taskSchema.parse(data);
    const { phaseId, milestoneId } = parseMilestoneFromTaskPath(taskFile);
    const milestoneRef = `${phaseId}/${milestoneId}`;
    const inferredDomain = inferDomainForTask(
      parsed.tags,
      parsed.slug,
      parsed.codeTargets,
      domains,
    );

    taskNodes.push({
      id: taskRef,
      title: parsed.title,
      milestone: milestoneRef,
      domain: inferredDomain,
      status: parsed.status,
      lane: parsed.lane,
    });
    taskDomainByRef.set(taskRef, inferredDomain);
    milestoneToTaskEdges.push({ milestone: milestoneRef, task: taskRef });

    for (const decisionId of parsed.decisions) {
      taskToDecisionEdges.push({ task: taskRef, decision: decisionId });
    }

    for (const target of [...parsed.codeTargets, ...parsed.publicDocs]) {
      const classification = classifyModuleTarget(target, graphConfig);
      if (classification.suppressed || !classification.module) {
        continue;
      }
      if (layerMode === "runtime" && !classification.isRuntime) {
        continue;
      }

      const existingNode = moduleNodeByName.get(classification.module);
      if (!existingNode) {
        moduleNodeByName.set(classification.module, {
          name: classification.module,
          type: "unknown",
          description: "",
          layer: classification.layer,
          confidence: "inferred",
        });
      }

      taskToModuleEdges.push({ task: taskRef, module: classification.module });
    }
  }

  for (const decisionFile of safeDecisionFiles.sort()) {
    try {
      const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(decisionFile);
      const parsed = decisionSchema.parse(data);
      knownDecisionIds.add(parsed.id);
      decisionNodes.push({
        id: parsed.id,
        title: parsed.title,
        status: parsed.status,
        scope: parsed.scope.kind,
      });

      for (const linkedTask of parsed.links.tasks) {
        const taskRef = normalizePath(linkedTask);
        taskToDecisionEdges.push({ task: taskRef, decision: parsed.id });
      }

      const decisionDomains = inferDomainsForDecision(
        parsed.links.codeTargets,
        parsed.links.tasks,
        taskDomainByRef,
        domains,
      );
      for (const domain of decisionDomains) {
        decisionToDomainEdges.push({ decision: parsed.id, domain });
      }
    } catch (error) {
      // Skip decisions with invalid schema but log the error
      const relativePath = path.relative(cwd, decisionFile);
      console.warn(`Warning: Skipping decision with invalid schema: ${relativePath}`);
      if (error instanceof Error) {
        console.warn(`  Error: ${error.message}`);
      }
      // Decision is skipped but graph building continues
    }
  }

  const normalizedTaskToDecision = uniqueSorted(
    taskToDecisionEdges
      .filter((edge) => knownDecisionIds.has(edge.decision))
      .map((edge) => `${edge.task}=>${edge.decision}`),
  ).map((key) => {
    const [task, decision] = key.split("=>");
    return { task, decision };
  });

  const normalizedTaskToModule = uniqueSorted(
    taskToModuleEdges.map((edge) => `${edge.task}=>${edge.module}`),
  ).map((key) => {
    const [task, module] = key.split("=>");
    return { task, module };
  });

  const normalizedDecisionToDomain = uniqueSorted(
    decisionToDomainEdges.map((edge) => `${edge.decision}=>${edge.domain}`),
  ).map((key) => {
    const [decision, domain] = key.split("=>");
    return { decision, domain };
  });

  const normalizedMilestoneToTask = uniqueSorted(
    milestoneToTaskEdges.map((edge) => `${edge.milestone}=>${edge.task}`),
  ).map((key) => {
    const [milestone, task] = key.split("=>");
    return { milestone, task };
  });

  const moduleNodes: ModuleNode[] = [...moduleNodeByName.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const domainsPayload = {
    domains: domains.map((domain) => ({
      name: domain.name,
      ownedPackages: uniqueSorted(domain.ownedPackages),
      ownedFeatures: uniqueSorted(domain.ownedFeatures),
    })),
  };
  const decisionsPayload = {
    decisions: decisionNodes.sort((a, b) => a.id.localeCompare(b.id)),
  };
  const milestonesPayload = {
    milestones: milestoneNodes.sort((a, b) => a.id.localeCompare(b.id)),
  };
  const tasksPayload = {
    tasks: taskNodes.sort((a, b) => a.id.localeCompare(b.id)),
  };
  const modulesPayload = {
    modules: moduleNodes.sort((a, b) => a.name.localeCompare(b.name)),
  };

  const taskToDecisionPayload = {
    edges: normalizedTaskToDecision,
  };
  const taskToModulePayload = {
    edges: normalizedTaskToModule,
  };
  const decisionToDomainPayload = {
    edges: normalizedDecisionToDomain,
  };
  const milestoneToTaskPayload = {
    edges: normalizedMilestoneToTask,
  };

  const graphPath = path.join(archRoot, "graph.json");
  const nextGraphSummary = {
    schemaVersion: "2.0",
    nodes: {
      domains: domains.length,
      decisions: decisionNodes.length,
      milestones: milestoneNodes.length,
      tasks: taskNodes.length,
      modules: moduleNodes.length,
    },
    edges: {
      task_to_decision: normalizedTaskToDecision.length,
      task_to_module: normalizedTaskToModule.length,
      decision_to_domain: normalizedDecisionToDomain.length,
      milestone_to_task: normalizedMilestoneToTask.length,
    },
  };

  let lastSync = new Date().toISOString();
  if (await pathExists(graphPath)) {
    const existingGraph = await readJson<{
      schemaVersion?: string;
      lastSync?: string;
      nodes?: Record<string, number>;
      edges?: Record<string, number>;
    }>(graphPath);

    const existingSummary = {
      schemaVersion: existingGraph.schemaVersion,
      nodes: existingGraph.nodes,
      edges: existingGraph.edges,
    };
    if (
      JSON.stringify(existingSummary) === JSON.stringify(nextGraphSummary) &&
      existingGraph.lastSync
    ) {
      lastSync = existingGraph.lastSync;
    }
  }

  const write = options.write ?? true;
  if (!write) {
    return;
  }

  await ensureDir(nodesRoot);
  await ensureDir(edgesRoot);

  await writeJsonDeterministicIfChanged(path.join(nodesRoot, "domains.json"), domainsPayload);
  await writeJsonDeterministicIfChanged(path.join(nodesRoot, "decisions.json"), decisionsPayload);
  await writeJsonDeterministicIfChanged(path.join(nodesRoot, "milestones.json"), milestonesPayload);
  await writeJsonDeterministicIfChanged(path.join(nodesRoot, "tasks.json"), tasksPayload);
  await writeJsonDeterministicIfChanged(path.join(nodesRoot, "modules.json"), modulesPayload);

  await writeJsonDeterministicIfChanged(
    path.join(edgesRoot, "task_to_decision.json"),
    taskToDecisionPayload,
  );
  await writeJsonDeterministicIfChanged(
    path.join(edgesRoot, "task_to_module.json"),
    taskToModulePayload,
  );
  await writeJsonDeterministicIfChanged(
    path.join(edgesRoot, "decision_to_domain.json"),
    decisionToDomainPayload,
  );
  await writeJsonDeterministicIfChanged(
    path.join(edgesRoot, "milestone_to_task.json"),
    milestoneToTaskPayload,
  );

  await writeJsonDeterministicIfChanged(graphPath, {
    ...nextGraphSummary,
    lastSync,
  });
}
