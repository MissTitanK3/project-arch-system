import path from "path";
import fg from "fast-glob";
import { decisionSchema } from "../../schemas/decision";
import { taskSchema } from "../../schemas/task";
import {
  ensureDir,
  pathExists,
  readJson,
  readMarkdownWithFrontmatter,
  writeJsonDeterministic,
} from "../../utils/fs";

interface DomainSpec {
  name: string;
  ownedPackages: string[];
  ownedFeatures: string[];
}

interface ModuleNode {
  name: string;
  type: string;
  description: string;
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
  const match = normalized.match(
    /roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/tasks\/[^/]+\/[^/]+\.md$/,
  );
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
  const match = normalized.match(/roadmap\/phases\/([^/]+)\/milestones\/([^/]+)\/manifest\.json$/);
  if (!match) {
    throw new Error(`Unexpected milestone manifest path: ${manifestPath}`);
  }
  return { phaseId: match[1], milestoneId: match[2] };
}

function mapTargetToModule(target: string): string {
  const normalized = normalizePath(target);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return normalized;
  }
  if ((parts[0] === "apps" || parts[0] === "packages") && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts[0] === "architecture" && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts[0] === "arch-domains") {
    return "arch-domains";
  }
  if (parts[0] === "roadmap") {
    return "roadmap";
  }
  return parts.slice(0, Math.min(parts.length, 2)).join("/");
}

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

export async function rebuildArchitectureGraph(cwd = process.cwd()): Promise<void> {
  const archRoot = path.join(cwd, ".arch");
  const nodesRoot = path.join(archRoot, "nodes");
  const edgesRoot = path.join(archRoot, "edges");
  await ensureDir(nodesRoot);
  await ensureDir(edgesRoot);

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
          (item): item is { name: string; type?: unknown; description?: unknown } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as { name?: unknown }).name === "string",
        )
        .map((item) => ({
          name: item.name,
          type: typeof item.type === "string" ? item.type : "unknown",
          description: typeof item.description === "string" ? item.description : "",
        }))
    : [];

  const taskFiles = await fg("roadmap/phases/*/milestones/*/tasks/*/*.md", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });
  const decisionFiles = await fg(["roadmap/decisions/**/*.md", "!roadmap/decisions/**/index.md"], {
    cwd,
    absolute: true,
    onlyFiles: true,
  });
  const milestoneManifestFiles = await fg("roadmap/phases/*/milestones/*/manifest.json", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });

  const taskNodes: TaskNode[] = [];
  const decisionNodes: DecisionNode[] = [];
  const milestoneNodes: MilestoneNode[] = [];

  const milestoneToTaskEdges: Array<{ milestone: string; task: string }> = [];
  const taskToDecisionEdges: Array<{ task: string; decision: string }> = [];
  const taskToModuleEdges: Array<{ task: string; module: string }> = [];
  const decisionToDomainEdges: Array<{ decision: string; domain: string }> = [];

  const taskDomainByRef = new Map<string, string | null>();
  const knownDecisionIds = new Set<string>();
  const moduleSet = new Set<string>(moduleNodesFromMap.map((node) => node.name));

  for (const manifestPath of milestoneManifestFiles.sort()) {
    const { phaseId, milestoneId } = parseMilestoneFromManifestPath(manifestPath);
    milestoneNodes.push({
      id: `${phaseId}/${milestoneId}`,
      phaseId,
      milestoneId,
    });
  }

  for (const taskFile of taskFiles.sort()) {
    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(taskFile);
    const parsed = taskSchema.parse(data);
    const { phaseId, milestoneId } = parseMilestoneFromTaskPath(taskFile);
    const milestoneRef = `${phaseId}/${milestoneId}`;
    const taskRef = `${milestoneRef}/${parsed.id}`;
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

    const targetModules = uniqueSorted(
      [...parsed.codeTargets, ...parsed.publicDocs].map((target) => mapTargetToModule(target)),
    );
    for (const moduleName of targetModules) {
      moduleSet.add(moduleName);
      taskToModuleEdges.push({ task: taskRef, module: moduleName });
    }
  }

  for (const decisionFile of decisionFiles.sort()) {
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

  const moduleNodes: ModuleNode[] = uniqueSorted([...moduleSet]).map((name) => {
    const existing = moduleNodesFromMap.find((node) => node.name === name);
    return existing ?? { name, type: "unknown", description: "" };
  });

  await writeJsonDeterministic(path.join(nodesRoot, "domains.json"), {
    domains: domains.map((domain) => ({
      name: domain.name,
      ownedPackages: uniqueSorted(domain.ownedPackages),
      ownedFeatures: uniqueSorted(domain.ownedFeatures),
    })),
  });
  await writeJsonDeterministic(path.join(nodesRoot, "decisions.json"), {
    decisions: decisionNodes.sort((a, b) => a.id.localeCompare(b.id)),
  });
  await writeJsonDeterministic(path.join(nodesRoot, "milestones.json"), {
    milestones: milestoneNodes.sort((a, b) => a.id.localeCompare(b.id)),
  });
  await writeJsonDeterministic(path.join(nodesRoot, "tasks.json"), {
    tasks: taskNodes.sort((a, b) => a.id.localeCompare(b.id)),
  });
  await writeJsonDeterministic(path.join(nodesRoot, "modules.json"), {
    modules: moduleNodes.sort((a, b) => a.name.localeCompare(b.name)),
  });

  await writeJsonDeterministic(path.join(edgesRoot, "task_to_decision.json"), {
    edges: normalizedTaskToDecision,
  });
  await writeJsonDeterministic(path.join(edgesRoot, "task_to_module.json"), {
    edges: normalizedTaskToModule,
  });
  await writeJsonDeterministic(path.join(edgesRoot, "decision_to_domain.json"), {
    edges: normalizedDecisionToDomain,
  });
  await writeJsonDeterministic(path.join(edgesRoot, "milestone_to_task.json"), {
    edges: normalizedMilestoneToTask,
  });

  await writeJsonDeterministic(path.join(archRoot, "graph.json"), {
    schemaVersion: "1.0",
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
  });
}
