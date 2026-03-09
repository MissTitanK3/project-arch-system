import path from "path";
import { currentDateISO } from "../../utils/date";
import { pathExists, readJson, writeJsonDeterministic } from "../../utils/fs";
import {
  decisionsRoot,
  milestoneDecisionsRoot,
  milestoneDir,
  phaseDecisionsRoot,
  phaseDir,
  projectDocsRoot,
} from "../../utils/paths";
import { PhaseManifest, phaseManifestSchema } from "../../schemas/phase";
import { MilestoneManifest, milestoneManifestSchema } from "../../schemas/milestone";

export interface DecisionIndex {
  schemaVersion: "1.0";
  decisions: string[];
}

export function defaultPhaseManifest(): PhaseManifest {
  return {
    schemaVersion: "1.0",
    phases: [],
    activePhase: null,
    activeMilestone: null,
  };
}

export async function loadPhaseManifest(cwd = process.cwd()): Promise<PhaseManifest> {
  const manifestPath = path.join(projectDocsRoot(cwd), "manifest.json");
  if (!(await pathExists(manifestPath))) {
    return defaultPhaseManifest();
  }
  const raw = await readJson<unknown>(manifestPath);
  return phaseManifestSchema.parse(raw);
}

export async function savePhaseManifest(data: PhaseManifest, cwd = process.cwd()): Promise<void> {
  const manifestPath = path.join(projectDocsRoot(cwd), "manifest.json");
  await writeJsonDeterministic(manifestPath, data);
}

export async function ensureDecisionIndex(dirPath: string): Promise<void> {
  const filePath = path.join(dirPath, "index.json");
  if (!(await pathExists(filePath))) {
    await writeJsonDeterministic(filePath, { schemaVersion: "1.0", decisions: [] });
  }
}

export async function loadDecisionIndex(dirPath: string): Promise<DecisionIndex> {
  const filePath = path.join(dirPath, "index.json");
  if (!(await pathExists(filePath))) {
    return { schemaVersion: "1.0", decisions: [] };
  }

  const raw = await readJson<unknown>(filePath);
  const parsed = raw as { schemaVersion?: string; decisions?: unknown };
  if (parsed.schemaVersion !== "1.0" || !Array.isArray(parsed.decisions)) {
    throw new Error(`Invalid decision index at ${filePath}`);
  }

  const decisions = [...parsed.decisions]
    .map((v) => {
      if (typeof v !== "string") {
        throw new Error(`Invalid decision id entry in ${filePath}`);
      }
      return v;
    })
    .sort();

  return { schemaVersion: "1.0", decisions };
}

export async function saveDecisionIndex(dirPath: string, index: DecisionIndex): Promise<void> {
  const filePath = path.join(dirPath, "index.json");
  const normalized: DecisionIndex = {
    schemaVersion: "1.0",
    decisions: [...index.decisions].sort(),
  };
  await writeJsonDeterministic(filePath, normalized);
}

export async function appendDecisionToIndex(dirPath: string, decisionId: string): Promise<void> {
  const current = await loadDecisionIndex(dirPath);
  if (!current.decisions.includes(decisionId)) {
    current.decisions.push(decisionId);
  }
  await saveDecisionIndex(dirPath, current);
}

export async function milestoneManifestPath(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<string> {
  return path.join(milestoneDir(phaseId, milestoneId, cwd), "manifest.json");
}

export function defaultMilestoneManifest(phaseId: string, milestoneId: string): MilestoneManifest {
  const now = currentDateISO();
  return {
    schemaVersion: "1.0",
    id: milestoneId,
    phaseId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadMilestoneManifest(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<MilestoneManifest> {
  const manifestPath = path.join(milestoneDir(phaseId, milestoneId, cwd), "manifest.json");
  if (!(await pathExists(manifestPath))) {
    throw new Error(`Missing milestone manifest: ${manifestPath}`);
  }
  const raw = await readJson<unknown>(manifestPath);
  return milestoneManifestSchema.parse(raw);
}

export async function saveMilestoneManifest(
  manifest: MilestoneManifest,
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): Promise<void> {
  const manifestPath = path.join(milestoneDir(phaseId, milestoneId, cwd), "manifest.json");
  await writeJsonDeterministic(manifestPath, manifest);
}

export function projectDecisionIndexDir(cwd = process.cwd()): string {
  return decisionsRoot(cwd);
}

export function phaseDecisionIndexDir(phaseId: string, cwd = process.cwd()): string {
  return phaseDecisionsRoot(phaseId, cwd);
}

export function milestoneDecisionIndexDir(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return milestoneDecisionsRoot(phaseId, milestoneId, cwd);
}

export function decisionMarkdownPath(decisionId: string, cwd = process.cwd()): string {
  return path.join(decisionsRoot(cwd), `${decisionId}.md`);
}

export function phaseOverviewPath(phaseId: string, cwd = process.cwd()): string {
  return path.join(phaseDir(phaseId, cwd), "overview.md");
}

export function milestoneOverviewPath(
  phaseId: string,
  milestoneId: string,
  cwd = process.cwd(),
): string {
  return path.join(milestoneDir(phaseId, milestoneId, cwd), "overview.md");
}

export { rebuildArchitectureGraph } from "./graph";
