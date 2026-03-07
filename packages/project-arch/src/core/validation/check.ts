import path from "path";
import fg from "fast-glob";
import { collectDecisionRecords } from "./decisions";
import { collectTaskRecords } from "./tasks";
import { loadDecisionIndex, loadMilestoneManifest, loadPhaseManifest } from "../manifests";
import { milestoneDir, milestoneTaskLaneDir, phaseDir, projectDocsRoot } from "../../utils/paths";
import { pathExists, readJson } from "../../utils/fs";
import { runDriftChecks } from "../../graph/drift/runChecks";

export interface CheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export async function runRepositoryChecks(cwd = process.cwd()): Promise<CheckResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const taskRecords = await collectTaskRecords(cwd);
  const decisionRecords = await collectDecisionRecords(cwd);
  const declaredModules = await loadDeclaredModules(cwd);
  const declaredDomains = await loadDeclaredDomains(cwd);

  const seenTaskKeys = new Set<string>();
  for (const task of taskRecords) {
    const key = `${task.phaseId}/${task.milestoneId}/${task.frontmatter.id}`;
    if (seenTaskKeys.has(key)) {
      errors.push(`Duplicate task id in milestone scope: ${key}`);
    } else {
      seenTaskKeys.add(key);
    }

    for (const target of task.frontmatter.codeTargets) {
      const targetPath = path.join(cwd, target);
      if (!(await pathExists(targetPath))) {
        errors.push(`Missing code target '${target}' referenced by task ${key}`);
      }
      const runtimeModule = toRuntimeModule(target);
      if (runtimeModule && !declaredModules.has(runtimeModule)) {
        errors.push(
          `Task ${key} references undeclared module '${runtimeModule}' via '${target}'. Declare it in arch-model/modules.json before implementation.`,
        );
      }
    }

    for (const ref of task.frontmatter.publicDocs) {
      const docPath = path.join(cwd, ref);
      if (!(await pathExists(docPath))) {
        errors.push(`Missing public docs path '${ref}' referenced by task ${key}`);
      }
    }

    for (const tag of task.frontmatter.tags) {
      const domainName = parseDomainTag(tag);
      if (domainName && !declaredDomains.has(domainName)) {
        errors.push(
          `Task ${key} references undeclared domain '${domainName}' in tag '${tag}'. Declare it in arch-domains/domains.json before implementation.`,
        );
      }
    }
  }

  const decisionIds = new Set(decisionRecords.map((d) => d.frontmatter.id));

  for (const decision of decisionRecords) {
    const id = decision.frontmatter.id;

    for (const taskRef of decision.frontmatter.links.tasks) {
      const parts = taskRef.split("/");
      if (parts.length !== 3) {
        errors.push(`Invalid decision task link '${taskRef}' in ${id}`);
        continue;
      }
      const [phaseId, milestoneId, taskId] = parts;

      const linkedTask = taskRecords.find(
        (record) =>
          record.phaseId === phaseId &&
          record.milestoneId === milestoneId &&
          record.frontmatter.id === taskId,
      );
      if (!linkedTask) {
        errors.push(`Decision ${id} links missing task '${taskRef}'`);
      }
    }

    for (const target of decision.frontmatter.links.codeTargets) {
      const targetPath = path.join(cwd, target);
      if (!(await pathExists(targetPath))) {
        errors.push(`Missing code target '${target}' referenced by decision ${id}`);
      }
      const runtimeModule = toRuntimeModule(target);
      if (runtimeModule && !declaredModules.has(runtimeModule)) {
        errors.push(
          `Decision ${id} references undeclared module '${runtimeModule}' via '${target}'. Declare it in arch-model/modules.json before implementation.`,
        );
      }
    }

    for (const ref of decision.frontmatter.links.publicDocs) {
      const docPath = path.join(cwd, ref);
      if (!(await pathExists(docPath))) {
        errors.push(`Missing public docs path '${ref}' referenced by decision ${id}`);
      }
    }

    const supersedes = decision.frontmatter.supersedes ?? [];
    for (const supersededId of supersedes) {
      if (!decisionIds.has(supersededId)) {
        errors.push(`Decision ${id} supersedes missing decision '${supersededId}'`);
      }
    }
  }

  const manifest = await loadPhaseManifest(cwd);
  const phaseIdsFromManifest = new Set(manifest.phases.map((p) => p.id));

  const phaseDirs = await fg("roadmap/phases/*", { cwd, onlyDirectories: true });
  for (const phasePath of phaseDirs) {
    const phaseId = path.basename(phasePath);
    if (!phaseIdsFromManifest.has(phaseId)) {
      errors.push(`Phase directory '${phaseId}' is missing in roadmap/manifest.json`);
    }

    const milestones = await fg(`roadmap/phases/${phaseId}/milestones/*`, {
      cwd,
      onlyDirectories: true,
      absolute: false,
    });

    for (const milestonePath of milestones.sort()) {
      const parts = milestonePath.split("/");
      const pId = phaseId;
      const mId = parts[4];

      if (!(await pathExists(milestoneDir(pId, mId, cwd)))) {
        continue;
      }

      try {
        await loadMilestoneManifest(pId, mId, cwd);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
      }

      for (const lane of ["planned", "discovered", "backlog"] as const) {
        const laneDir = milestoneTaskLaneDir(pId, mId, lane, cwd);
        if (!(await pathExists(laneDir))) {
          errors.push(`Missing lane directory '${laneDir}'`);
        }
      }
    }
  }

  const projectDecisionIndex = await loadDecisionIndex(
    path.join(projectDocsRoot(cwd), "decisions"),
  );
  for (const id of projectDecisionIndex.decisions) {
    if (!decisionIds.has(id)) {
      errors.push(`Project decision index references missing decision '${id}'`);
    }
  }

  for (const phaseId of phaseIdsFromManifest) {
    const index = await loadDecisionIndex(path.join(phaseDir(phaseId, cwd), "decisions"));
    for (const id of index.decisions) {
      if (!decisionIds.has(id)) {
        errors.push(`Phase ${phaseId} decision index references missing decision '${id}'`);
      }
    }

    const milestones = await fg(`roadmap/phases/${phaseId}/milestones/*`, {
      cwd,
      onlyDirectories: true,
    });
    for (const milestonePath of milestones.sort()) {
      const mId = path.basename(milestonePath);
      const mIndex = await loadDecisionIndex(
        path.join(milestoneDir(phaseId, mId, cwd), "decisions"),
      );
      for (const id of mIndex.decisions) {
        if (!decisionIds.has(id)) {
          errors.push(
            `Milestone ${phaseId}/${mId} decision index references missing decision '${id}'`,
          );
        }
      }
    }
  }

  const driftFindings = await runDriftChecks({ cwd, taskRecords, decisionRecords });
  for (const finding of driftFindings) {
    const rendered = `[${finding.code}] ${finding.message}`;
    if (finding.severity === "error") {
      errors.push(rendered);
    } else {
      warnings.push(rendered);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function toRuntimeModule(target: string): string | null {
  const normalized = target.replace(/\\/g, "/");
  if (!normalized.startsWith("apps/") && !normalized.startsWith("packages/")) {
    return null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

function parseDomainTag(tag: string): string | null {
  const lower = tag.toLowerCase();
  const prefix = "domain:";
  if (!lower.startsWith(prefix)) {
    return null;
  }
  const value = lower.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

async function loadDeclaredModules(cwd: string): Promise<Set<string>> {
  const modulesPath = path.join(cwd, "arch-model", "modules.json");
  if (!(await pathExists(modulesPath))) {
    return new Set<string>();
  }
  const raw = await readJson<{ modules?: unknown }>(modulesPath);
  if (!Array.isArray(raw.modules)) {
    return new Set<string>();
  }
  const modules = raw.modules
    .filter(
      (item): item is { name: string } =>
        !!item && typeof item === "object" && typeof item.name === "string",
    )
    .map((item) => item.name);
  return new Set(modules);
}

async function loadDeclaredDomains(cwd: string): Promise<Set<string>> {
  const domainsPath = path.join(cwd, "arch-domains", "domains.json");
  if (!(await pathExists(domainsPath))) {
    return new Set<string>();
  }
  const raw = await readJson<{ domains?: unknown }>(domainsPath);
  if (!Array.isArray(raw.domains)) {
    return new Set<string>();
  }
  const domains = raw.domains
    .filter(
      (item): item is { name: string } =>
        !!item && typeof item === "object" && typeof item.name === "string",
    )
    .map((item) => item.name.toLowerCase());
  return new Set(domains);
}
