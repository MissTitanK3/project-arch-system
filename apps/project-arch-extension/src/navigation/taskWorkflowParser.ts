import path from "node:path";

export type TaskType =
  | "implementation"
  | "spec"
  | "ui"
  | "research"
  | "validation"
  | "integration"
  | "refactor"
  | "migration"
  | (string & {});

export type TaskWorkflowRuntimePreference = "deterministic" | "local" | "cloud" | "hybrid";
export type TaskWorkflowItemStatus = "planned" | "in_progress" | "done" | "blocked" | "skipped";
export type NormalizedTaskWorkflowBodySectionKind =
  | "scope"
  | "objective"
  | "acceptance-checks"
  | "implementation-plan"
  | "verification"
  | "evidence"
  | "trace-links"
  | "dependencies"
  | "workflow-mirror"
  | "explicit-checklist";
export type NormalizedTaskWorkflowAuthoritativeSource =
  | "frontmatter"
  | "markdown-body"
  | "task-type-default"
  | "mixed";
export type NormalizedTaskWorkflowStageState =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked";

export interface NormalizedTaskWorkflowBodySectionRef {
  kind: NormalizedTaskWorkflowBodySectionKind;
  heading: string;
}

export interface NormalizedTaskWorkflowItem {
  id: string;
  label: string;
  status: TaskWorkflowItemStatus;
  runtimePreference: TaskWorkflowRuntimePreference;
  source: "frontmatter" | "markdown-body" | "task-type-default";
  notes?: string;
  commandHint?: string;
  evidencePaths: string[];
  bodySection?: NormalizedTaskWorkflowBodySectionRef;
}

export interface NormalizedTaskWorkflowStage {
  id: string;
  title: string;
  description?: string;
  runtimePreference: TaskWorkflowRuntimePreference;
  source: "frontmatter" | "markdown-body" | "task-type-default";
  bodySection?: NormalizedTaskWorkflowBodySectionRef;
  items: NormalizedTaskWorkflowItem[];
  summary: {
    total: number;
    planned: number;
    inProgress: number;
    done: number;
    blocked: number;
    skipped: number;
    completionRatio: number;
  };
  state: NormalizedTaskWorkflowStageState;
}

export interface NormalizedTaskWorkflow {
  task: {
    id: string;
    slug: string;
    title: string;
    lane: "planned" | "discovered" | "backlog";
    status: string;
    taskType: TaskType;
  };
  workflow: {
    schemaVersion: "2.0";
    template: string;
    sources: {
      authoritativeWorkflow: NormalizedTaskWorkflowAuthoritativeSource;
      authoritativeCompletion: NormalizedTaskWorkflowAuthoritativeSource;
      supportingMarkdownMirror: "present" | "absent";
      supportingSections: NormalizedTaskWorkflowBodySectionRef[];
    };
    stages: NormalizedTaskWorkflowStage[];
    summary: {
      totalStages: number;
      notStartedStages: number;
      inProgressStages: number;
      completedStages: number;
      blockedStages: number;
      overallState: NormalizedTaskWorkflowStageState;
      items: NormalizedTaskWorkflowStage["summary"];
    };
  };
}

interface MarkdownSection {
  heading: string;
  kind?: NormalizedTaskWorkflowBodySectionKind;
  content: string;
}

interface ParsedTaskFrontmatter {
  id: string;
  slug: string;
  title: string;
  lane: "planned" | "discovered" | "backlog";
  status: string;
  taskType: TaskType;
  workflow?: {
    schemaVersion: "2.0";
    template: string;
    stages: Array<{
      id: string;
      title: string;
      description?: string;
      runtimePreference: TaskWorkflowRuntimePreference;
      items: Array<{
        id: string;
        label: string;
        status: TaskWorkflowItemStatus;
        notes?: string;
        commandHint?: string;
        evidencePaths?: string[];
      }>;
    }>;
  };
  acceptanceChecks: string[];
  completionCriteria: string[];
  evidence: string[];
  traceLinks: string[];
  tags: string[];
}

const SECTION_KIND_BY_HEADING: Record<string, NormalizedTaskWorkflowBodySectionKind> = {
  scope: "scope",
  objective: "objective",
  "acceptance checks": "acceptance-checks",
  "implementation plan": "implementation-plan",
  verification: "verification",
  evidence: "evidence",
  "trace links": "trace-links",
  dependencies: "dependencies",
  "workflow checklist (mirrored)": "workflow-mirror",
  "workflow checklist": "workflow-mirror",
};

const KNOWN_TASK_TYPES = [
  "implementation",
  "spec",
  "ui",
  "research",
  "validation",
  "integration",
  "refactor",
  "migration",
] as const;

const TASK_TYPE_TEMPLATE_MAP: Record<(typeof KNOWN_TASK_TYPES)[number], string> = {
  implementation: "default-implementation",
  spec: "spec-authoring",
  ui: "ui-iteration",
  research: "research-discovery",
  validation: "validation-only",
  integration: "integration-delivery",
  refactor: "refactor-delivery",
  migration: "migration-execution",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "item";
}

function uniqueId(base: string, usedIds: Set<string>): string {
  let candidate = slugify(base);
  if (!usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let suffix = 2;
  while (usedIds.has(`${candidate}-${suffix}`)) {
    suffix += 1;
  }

  candidate = `${candidate}-${suffix}`;
  usedIds.add(candidate);
  return candidate;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function stripQuotedValue(value: string): string {
  return value
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
}

function indentation(line: string): number {
  const match = line.match(/^(\s*)/);
  return match?.[1]?.length ?? 0;
}

function splitFrontmatter(rawContent: string): { frontmatterLines: string[]; content: string } {
  const lines = rawContent.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { frontmatterLines: [], content: rawContent };
  }

  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closingIndex < 0) {
    return { frontmatterLines: [], content: rawContent };
  }

  const endIndex = closingIndex + 1;
  return {
    frontmatterLines: lines.slice(1, endIndex),
    content: lines.slice(endIndex + 1).join("\n"),
  };
}

function parseScalar(rawValue: string): string {
  return stripQuotedValue(rawValue);
}

function parseStringArray(lines: string[], key: string): string[] {
  const matcher = new RegExp(`^${key}:\\s*(.*)$`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    const match = trimmed.match(matcher);
    if (!match) {
      continue;
    }

    const immediate = match[1]?.trim() ?? "";
    if (immediate.startsWith("[") && immediate.endsWith("]")) {
      return immediate
        .slice(1, -1)
        .split(",")
        .map((entry) => parseScalar(entry))
        .filter((entry) => entry.length > 0);
    }

    if (immediate.length > 0 && immediate !== "[]") {
      return [parseScalar(immediate)].filter((entry) => entry.length > 0);
    }

    const output: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor] ?? "";
      if (indentation(next) < 2) {
        break;
      }

      const itemMatch = next.match(/^\s*-\s+(.+)$/);
      if (!itemMatch) {
        break;
      }

      const value = parseScalar(itemMatch[1] ?? "");
      if (value.length > 0 && value !== "...") {
        output.push(value);
      }
      cursor += 1;
    }

    return output;
  }

  return [];
}

function parseStringValue(lines: string[], key: string): string | undefined {
  const matcher = new RegExp(`^${key}:\\s*(.+)$`, "i");
  const line = lines.find(
    (candidate) => indentation(candidate) === 0 && matcher.test(candidate.trim()),
  );
  if (!line) {
    return undefined;
  }

  return parseScalar(line.trim().replace(matcher, "$1"));
}

function parseWorkflow(lines: string[]): ParsedTaskFrontmatter["workflow"] {
  const workflowStart = lines.findIndex((line) => line.trim() === "workflow:");
  if (workflowStart < 0) {
    return undefined;
  }

  let schemaVersion: "2.0" | undefined;
  let template: string | undefined;
  const stages: NonNullable<ParsedTaskFrontmatter["workflow"]>["stages"] = [];
  let cursor = workflowStart + 1;

  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    if (indentation(line) === 0) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("schemaVersion:")) {
      const value = parseScalar(trimmed.replace(/^schemaVersion:\s*/, ""));
      schemaVersion = value === "2.0" ? "2.0" : undefined;
      cursor += 1;
      continue;
    }

    if (trimmed.startsWith("template:")) {
      template = parseScalar(trimmed.replace(/^template:\s*/, ""));
      cursor += 1;
      continue;
    }

    if (trimmed === "stages:") {
      cursor += 1;
      while (cursor < lines.length) {
        const stageLine = lines[cursor] ?? "";
        if (indentation(stageLine) < 4) {
          break;
        }
        if (!/^\s*-\s+id:\s+/.test(stageLine)) {
          cursor += 1;
          continue;
        }

        const stage = {
          id: parseScalar(stageLine.replace(/^\s*-\s+id:\s+/, "")),
          title: "Stage",
          description: undefined as string | undefined,
          runtimePreference: "local" as TaskWorkflowRuntimePreference,
          items: [] as NonNullable<ParsedTaskFrontmatter["workflow"]>["stages"][number]["items"],
        };
        cursor += 1;

        while (cursor < lines.length) {
          const next = lines[cursor] ?? "";
          if (indentation(next) < 4 || /^\s*-\s+id:\s+/.test(next)) {
            break;
          }

          const nextTrimmed = next.trim();
          if (nextTrimmed.startsWith("title:")) {
            stage.title = parseScalar(nextTrimmed.replace(/^title:\s*/, ""));
          } else if (nextTrimmed.startsWith("description:")) {
            stage.description = parseScalar(nextTrimmed.replace(/^description:\s*/, ""));
          } else if (nextTrimmed.startsWith("runtimePreference:")) {
            const value = parseScalar(nextTrimmed.replace(/^runtimePreference:\s*/, ""));
            if (
              value === "deterministic" ||
              value === "local" ||
              value === "cloud" ||
              value === "hybrid"
            ) {
              stage.runtimePreference = value;
            }
          } else if (nextTrimmed === "items:") {
            cursor += 1;
            while (cursor < lines.length) {
              const itemLine = lines[cursor] ?? "";
              if (indentation(itemLine) < 8) {
                cursor -= 1;
                break;
              }
              if (!/^\s*-\s+id:\s+/.test(itemLine)) {
                cursor += 1;
                continue;
              }

              const item = {
                id: parseScalar(itemLine.replace(/^\s*-\s+id:\s+/, "")),
                label: "Task item",
                status: "planned" as TaskWorkflowItemStatus,
                notes: undefined as string | undefined,
                commandHint: undefined as string | undefined,
                evidencePaths: undefined as string[] | undefined,
              };
              cursor += 1;

              while (cursor < lines.length) {
                const itemPropLine = lines[cursor] ?? "";
                if (indentation(itemPropLine) < 8 || /^\s*-\s+id:\s+/.test(itemPropLine)) {
                  cursor -= 1;
                  break;
                }

                const itemTrimmed = itemPropLine.trim();
                if (itemTrimmed.startsWith("label:")) {
                  item.label = parseScalar(itemTrimmed.replace(/^label:\s*/, ""));
                } else if (itemTrimmed.startsWith("status:")) {
                  const value = parseScalar(itemTrimmed.replace(/^status:\s*/, ""));
                  if (
                    value === "planned" ||
                    value === "in_progress" ||
                    value === "done" ||
                    value === "blocked" ||
                    value === "skipped"
                  ) {
                    item.status = value;
                  }
                } else if (itemTrimmed.startsWith("notes:")) {
                  item.notes = parseScalar(itemTrimmed.replace(/^notes:\s*/, ""));
                } else if (itemTrimmed.startsWith("commandHint:")) {
                  item.commandHint = parseScalar(itemTrimmed.replace(/^commandHint:\s*/, ""));
                } else if (itemTrimmed.startsWith("evidencePaths:")) {
                  const remainder = itemTrimmed.replace(/^evidencePaths:\s*/, "").trim();
                  if (remainder.startsWith("[") && remainder.endsWith("]")) {
                    item.evidencePaths = remainder
                      .slice(1, -1)
                      .split(",")
                      .map((entry) => parseScalar(entry))
                      .filter((entry) => entry.length > 0);
                  } else {
                    const evidencePaths: string[] = [];
                    let evidenceCursor = cursor + 1;
                    while (evidenceCursor < lines.length) {
                      const evidenceLine = lines[evidenceCursor] ?? "";
                      if (indentation(evidenceLine) < 12) {
                        break;
                      }

                      const evidenceMatch = evidenceLine.match(/^\s*-\s+(.+)$/);
                      if (!evidenceMatch) {
                        break;
                      }

                      const value = parseScalar(evidenceMatch[1] ?? "");
                      if (value.length > 0) {
                        evidencePaths.push(value);
                      }
                      evidenceCursor += 1;
                    }

                    if (evidencePaths.length > 0) {
                      item.evidencePaths = evidencePaths;
                      cursor = evidenceCursor - 1;
                    }
                  }
                }
                cursor += 1;
              }

              stage.items.push(item);
              cursor += 1;
            }
          }
          cursor += 1;
        }

        if (stage.items.length > 0) {
          stages.push(stage);
        }
      }
      continue;
    }

    cursor += 1;
  }

  if (!schemaVersion || !template || stages.length === 0) {
    return undefined;
  }

  return { schemaVersion, template, stages };
}

function parseSections(content: string): MarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentHeading: string | undefined;
  let currentContent: string[] = [];

  const flush = (): void => {
    if (!currentHeading) {
      return;
    }

    sections.push({
      heading: currentHeading,
      kind: SECTION_KIND_BY_HEADING[currentHeading.trim().toLowerCase()],
      content: currentContent.join("\n").trimEnd(),
    });
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/)?.[1]?.trim();
    if (heading) {
      flush();
      currentHeading = heading;
      currentContent = [];
      continue;
    }

    if (currentHeading) {
      currentContent.push(line);
    }
  }

  flush();
  return sections;
}

function summarizeItems(items: readonly Pick<NormalizedTaskWorkflowItem, "status">[]) {
  const summary = {
    total: items.length,
    planned: 0,
    inProgress: 0,
    done: 0,
    blocked: 0,
    skipped: 0,
    completionRatio: 0,
  };

  for (const item of items) {
    switch (item.status) {
      case "planned":
        summary.planned += 1;
        break;
      case "in_progress":
        summary.inProgress += 1;
        break;
      case "done":
        summary.done += 1;
        break;
      case "blocked":
        summary.blocked += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
    }
  }

  summary.completionRatio =
    summary.total === 0 ? 0 : (summary.done + summary.skipped) / summary.total;
  return summary;
}

function stageState(
  summary: ReturnType<typeof summarizeItems>,
): NormalizedTaskWorkflowStage["state"] {
  if (summary.total === 0) {
    return "not_started";
  }
  if (summary.done + summary.skipped === summary.total) {
    return "completed";
  }
  if (summary.blocked > 0) {
    return "blocked";
  }
  if (summary.inProgress > 0 || summary.done > 0 || summary.skipped > 0) {
    return "in_progress";
  }
  return "not_started";
}

function workflowSummary(
  stages: readonly Pick<NormalizedTaskWorkflowStage, "state" | "summary">[],
) {
  const summary = {
    totalStages: stages.length,
    notStartedStages: 0,
    inProgressStages: 0,
    completedStages: 0,
    blockedStages: 0,
    overallState: "not_started" as NormalizedTaskWorkflowStage["state"],
    items: {
      total: 0,
      planned: 0,
      inProgress: 0,
      done: 0,
      blocked: 0,
      skipped: 0,
      completionRatio: 0,
    },
  };

  for (const stage of stages) {
    switch (stage.state) {
      case "not_started":
        summary.notStartedStages += 1;
        break;
      case "in_progress":
        summary.inProgressStages += 1;
        break;
      case "completed":
        summary.completedStages += 1;
        break;
      case "blocked":
        summary.blockedStages += 1;
        break;
    }

    summary.items.total += stage.summary.total;
    summary.items.planned += stage.summary.planned;
    summary.items.inProgress += stage.summary.inProgress;
    summary.items.done += stage.summary.done;
    summary.items.blocked += stage.summary.blocked;
    summary.items.skipped += stage.summary.skipped;
  }

  summary.items.completionRatio =
    summary.items.total === 0
      ? 0
      : (summary.items.done + summary.items.skipped) / summary.items.total;

  summary.overallState =
    summary.totalStages === 0
      ? "not_started"
      : summary.completedStages === summary.totalStages
        ? "completed"
        : summary.blockedStages > 0
          ? "blocked"
          : summary.inProgressStages > 0 || summary.completedStages > 0
            ? "in_progress"
            : "not_started";

  return summary;
}

function parseChecklist(content: string): Array<{ label: string; status: "planned" | "done" }> {
  const items: Array<{ label: string; status: "planned" | "done" }> = [];
  for (const line of content.split(/\r?\n/)) {
    const checklist = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (checklist) {
      items.push({
        label: checklist[2]?.trim() ?? "",
        status: checklist[1]?.toLowerCase() === "x" ? "done" : "planned",
      });
      continue;
    }

    const bullet = line.match(/^\s*-\s+(.+)$/);
    if (bullet) {
      const label = bullet[1]?.trim() ?? "";
      if (label.length > 0 && label !== "...") {
        items.push({ label, status: "planned" });
      }
    }
  }
  return items;
}

function parseFrontmatter(raw: Record<string, unknown>, filePath?: string): ParsedTaskFrontmatter {
  const basename = filePath ? path.basename(filePath, path.extname(filePath)) : undefined;
  const id =
    typeof raw.id === "string" && /^\d{3}$/.test(raw.id.trim())
      ? raw.id.trim()
      : (basename?.match(/^(\d{3})-/)?.[1] ?? "000");
  const title =
    typeof raw.title === "string" && raw.title.trim().length > 0
      ? raw.title.trim()
      : basename
          ?.replace(/^\d{3}-/, "")
          .replace(/-/g, " ")
          .trim() || "Untitled task";
  const slug =
    typeof raw.slug === "string" && raw.slug.trim().length > 0
      ? slugify(raw.slug.trim())
      : slugify((basename?.replace(/^\d{3}-/, "") ?? title).trim());
  const lane =
    raw.lane === "planned" || raw.lane === "discovered" || raw.lane === "backlog"
      ? raw.lane
      : ((filePath
          ?.split(path.sep)
          .join("/")
          .match(/\/tasks\/(planned|discovered|backlog)\//)?.[1] as
          | "planned"
          | "discovered"
          | "backlog"
          | undefined) ?? "planned");
  const explicitTaskType =
    typeof raw.taskType === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.taskType.trim())
      ? (raw.taskType.trim() as TaskType)
      : undefined;
  const sections = parseSections("");
  const tags = toStringArray(raw.tags);
  const inferredTaskType = explicitTaskType ?? inferTaskType(title, slug, tags, sections);

  return {
    id,
    slug,
    title,
    lane,
    status:
      typeof raw.status === "string" && raw.status.trim().length > 0 ? raw.status.trim() : lane,
    taskType: inferredTaskType,
    workflow: isRecord(raw.workflow)
      ? (raw.workflow as ParsedTaskFrontmatter["workflow"])
      : undefined,
    acceptanceChecks: toStringArray(raw.acceptanceChecks),
    completionCriteria: toStringArray(raw.completionCriteria),
    evidence: toStringArray(raw.evidence),
    traceLinks: toStringArray(raw.traceLinks),
    tags,
  };
}

function inferTaskType(
  title: string,
  slug: string,
  tags: string[],
  sections: MarkdownSection[],
): TaskType {
  const normalizedTags = new Set(tags.map((tag) => tag.toLowerCase()));
  for (const taskType of KNOWN_TASK_TYPES) {
    if (normalizedTags.has(taskType)) {
      return taskType;
    }
  }

  const haystack =
    `${title} ${slug} ${sections.map((section) => section.heading).join(" ")}`.toLowerCase();
  const keywordChecks: Array<{ type: TaskType; keywords: string[] }> = [
    { type: "spec", keywords: ["spec", "schema", "contract", "rfc"] },
    { type: "research", keywords: ["research", "investigate", "analysis", "discovery"] },
    { type: "ui", keywords: ["ui", "ux", "design", "visual"] },
    { type: "validation", keywords: ["validation", "verify", "test", "lint", "check"] },
    { type: "integration", keywords: ["integration", "integrate"] },
    { type: "refactor", keywords: ["refactor", "cleanup"] },
    { type: "migration", keywords: ["migration", "migrate"] },
  ];

  for (const candidate of keywordChecks) {
    if (candidate.keywords.some((keyword) => haystack.includes(keyword))) {
      return candidate.type;
    }
  }

  return "implementation";
}

function firstSectionRef(
  sections: MarkdownSection[],
  kinds: readonly NormalizedTaskWorkflowBodySectionKind[],
): NormalizedTaskWorkflowBodySectionRef | undefined {
  const match = sections.find((section) => section.kind && kinds.includes(section.kind));
  return match?.kind ? { kind: match.kind, heading: match.heading } : undefined;
}

function supportingSections(sections: MarkdownSection[]): NormalizedTaskWorkflowBodySectionRef[] {
  return sections
    .filter(
      (section): section is MarkdownSection & { kind: NormalizedTaskWorkflowBodySectionKind } =>
        Boolean(section.kind),
    )
    .map((section) => ({ kind: section.kind, heading: section.heading }));
}

function mirrorState(content: string): "present" | "absent" {
  return /^\s*-\s+\[[ xX]\]\s+/m.test(content) ? "present" : "absent";
}

function runtimePreferenceForTaskType(taskType: TaskType): TaskWorkflowRuntimePreference {
  switch (taskType) {
    case "spec":
      return "hybrid";
    case "research":
    case "validation":
      return "local";
    default:
      return "cloud";
  }
}

function buildItem(input: {
  usedIds: Set<string>;
  label: string;
  status: TaskWorkflowItemStatus;
  runtimePreference: TaskWorkflowRuntimePreference;
  source: NormalizedTaskWorkflowItem["source"];
  bodySection?: NormalizedTaskWorkflowBodySectionRef;
  evidencePaths?: string[];
}): NormalizedTaskWorkflowItem {
  return {
    id: uniqueId(input.label, input.usedIds),
    label: input.label,
    status: input.status,
    runtimePreference: input.runtimePreference,
    source: input.source,
    evidencePaths: input.evidencePaths ?? [],
    ...(input.bodySection ? { bodySection: input.bodySection } : {}),
  };
}

function buildExplicitWorkflow(
  frontmatter: ParsedTaskFrontmatter,
  sections: MarkdownSection[],
  content: string,
): NormalizedTaskWorkflow {
  const stageIds = new Set<string>();
  const itemIds = new Set<string>();
  const stages = (frontmatter.workflow?.stages ?? []).map<NormalizedTaskWorkflowStage>((stage) => {
    const bodySection = firstSectionRef(
      sections,
      stage.id === "validation"
        ? ["acceptance-checks", "verification"]
        : stage.id === "implementation"
          ? ["implementation-plan"]
          : stage.id === "follow-up-closure"
            ? ["evidence", "trace-links"]
            : stage.id === "context-readiness"
              ? ["scope", "objective", "dependencies"]
              : ["scope", "objective"],
    );
    const items = stage.items.map<NormalizedTaskWorkflowItem>((item) => ({
      id: uniqueId(item.id, itemIds),
      label: item.label,
      status: item.status,
      runtimePreference: stage.runtimePreference,
      source: "frontmatter",
      evidencePaths: item.evidencePaths ?? [],
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.commandHint ? { commandHint: item.commandHint } : {}),
      ...(bodySection ? { bodySection } : {}),
    }));
    const summary = summarizeItems(items);
    return {
      id: uniqueId(stage.id, stageIds),
      title: stage.title,
      runtimePreference: stage.runtimePreference,
      source: "frontmatter",
      items,
      summary,
      state: stageState(summary),
      ...(stage.description ? { description: stage.description } : {}),
      ...(bodySection ? { bodySection } : {}),
    };
  });

  return {
    task: {
      id: frontmatter.id,
      slug: frontmatter.slug,
      title: frontmatter.title,
      lane: frontmatter.lane,
      status: frontmatter.status,
      taskType: frontmatter.taskType,
    },
    workflow: {
      schemaVersion: "2.0",
      template: frontmatter.workflow?.template ?? TASK_TYPE_TEMPLATE_MAP.implementation,
      sources: {
        authoritativeWorkflow: "frontmatter",
        authoritativeCompletion: "frontmatter",
        supportingMarkdownMirror: mirrorState(content),
        supportingSections: supportingSections(sections),
      },
      stages,
      summary: workflowSummary(stages),
    },
  };
}

function buildFallbackWorkflow(
  frontmatter: ParsedTaskFrontmatter,
  sections: MarkdownSection[],
  content: string,
): NormalizedTaskWorkflow {
  const sectionByKind = new Map<NormalizedTaskWorkflowBodySectionKind, MarkdownSection>();
  for (const section of sections) {
    if (section.kind) {
      sectionByKind.set(section.kind, section);
    }
  }

  const stageIds = new Set<string>();
  const itemIds = new Set<string>();
  let usedMarkdownWorkflow = false;
  let usedDefaultWorkflow = false;
  let usedMarkdownCompletion = false;
  let usedDefaultCompletion = false;

  const stageDefs: Array<{
    id: string;
    title: string;
    description: string;
    runtimePreference: TaskWorkflowRuntimePreference;
    sectionKinds: NormalizedTaskWorkflowBodySectionKind[];
    fallbackLabels: string[];
  }> = [
    {
      id: "task-refinement",
      title: "Task Refinement",
      description: "Tighten task intent and keep the artifact aligned with current context.",
      runtimePreference: "local",
      sectionKinds: ["scope", "objective"],
      fallbackLabels: ["Update task based on current repository context"],
    },
    {
      id: "context-readiness",
      title: "Context and Readiness",
      description: "Review scope, objective, and repository context before acting.",
      runtimePreference: "local",
      sectionKinds: ["scope", "objective", "dependencies"],
      fallbackLabels: ["Review scope and objective", "Inspect dependencies and blockers"],
    },
    {
      id: "implementation",
      title: "Implementation",
      description: "Carry out the main task work and keep implementation notes aligned.",
      runtimePreference: runtimePreferenceForTaskType(frontmatter.taskType),
      sectionKinds: ["implementation-plan"],
      fallbackLabels: ["Implement the planned task slice"],
    },
    {
      id: "validation",
      title: "Validation",
      description: "Verify acceptance checks and supporting validation steps.",
      runtimePreference: "local",
      sectionKinds: ["acceptance-checks", "verification"],
      fallbackLabels: ["Validate acceptance checks and verification steps"],
    },
    {
      id: "follow-up-closure",
      title: "Follow-up and Closure",
      description: "Capture evidence, trace links, and any follow-up work before closure.",
      runtimePreference: "local",
      sectionKinds: ["evidence", "trace-links"],
      fallbackLabels: ["Collect evidence and record follow-up work"],
    },
  ];

  const stages = stageDefs.map<NormalizedTaskWorkflowStage>((stageDef) => {
    const items: NormalizedTaskWorkflowItem[] = [];
    const bodySection = firstSectionRef(sections, stageDef.sectionKinds);

    for (const kind of stageDef.sectionKinds) {
      const section = sectionByKind.get(kind);
      if (!section) {
        continue;
      }

      if (kind === "dependencies") {
        let currentSubheading: string | undefined;
        for (const line of section.content.split(/\r?\n/)) {
          const subheading = line
            .match(/^###\s+(.+)$/)?.[1]
            ?.trim()
            .toLowerCase();
          if (subheading) {
            currentSubheading = subheading;
            continue;
          }

          const bullet = line.match(/^\s*-\s+(.+)$/)?.[1]?.trim();
          if (!bullet || bullet === "...") {
            continue;
          }

          usedMarkdownWorkflow = true;
          usedMarkdownCompletion = true;
          items.push(
            buildItem({
              usedIds: itemIds,
              label:
                currentSubheading === "depends on"
                  ? `Inspect dependency ${bullet}`
                  : currentSubheading === "blocks"
                    ? `Track blocker relationship for ${bullet}`
                    : bullet,
              status: "planned",
              runtimePreference: stageDef.runtimePreference,
              source: "markdown-body",
              bodySection: { kind, heading: section.heading },
            }),
          );
        }
        continue;
      }

      for (const parsedItem of parseChecklist(section.content)) {
        usedMarkdownWorkflow = true;
        usedMarkdownCompletion = true;
        items.push(
          buildItem({
            usedIds: itemIds,
            label: parsedItem.label,
            status: parsedItem.status,
            runtimePreference: stageDef.runtimePreference,
            source: "markdown-body",
            bodySection: { kind, heading: section.heading },
            evidencePaths: kind === "evidence" ? [parsedItem.label] : [],
          }),
        );
      }
    }

    if (stageDef.id === "validation" && items.length === 0) {
      const checks = [...frontmatter.acceptanceChecks, ...frontmatter.completionCriteria].filter(
        (value, index, array) => array.indexOf(value) === index,
      );
      const acceptanceSection = sectionByKind.get("acceptance-checks");
      for (const check of checks) {
        usedMarkdownWorkflow = true;
        usedMarkdownCompletion = true;
        items.push(
          buildItem({
            usedIds: itemIds,
            label: check,
            status: "planned",
            runtimePreference: stageDef.runtimePreference,
            source: "markdown-body",
            bodySection: acceptanceSection
              ? { kind: "acceptance-checks", heading: acceptanceSection.heading }
              : undefined,
          }),
        );
      }
    }

    if (stageDef.id === "follow-up-closure" && items.length === 0) {
      for (const evidencePath of frontmatter.evidence) {
        usedMarkdownWorkflow = true;
        usedMarkdownCompletion = true;
        items.push(
          buildItem({
            usedIds: itemIds,
            label: `Collect evidence ${evidencePath}`,
            status: "planned",
            runtimePreference: stageDef.runtimePreference,
            source: "markdown-body",
            bodySection,
            evidencePaths: [evidencePath],
          }),
        );
      }

      for (const traceLink of frontmatter.traceLinks) {
        usedMarkdownWorkflow = true;
        usedMarkdownCompletion = true;
        items.push(
          buildItem({
            usedIds: itemIds,
            label: `Record trace link ${traceLink}`,
            status: "planned",
            runtimePreference: stageDef.runtimePreference,
            source: "markdown-body",
            bodySection,
          }),
        );
      }
    }

    if (items.length === 0) {
      usedDefaultWorkflow = true;
      usedDefaultCompletion = true;
      for (const fallbackLabel of stageDef.fallbackLabels) {
        items.push(
          buildItem({
            usedIds: itemIds,
            label: fallbackLabel,
            status: "planned",
            runtimePreference: stageDef.runtimePreference,
            source: "task-type-default",
            bodySection,
          }),
        );
      }
    }

    const summary = summarizeItems(items);
    return {
      id: uniqueId(stageDef.id, stageIds),
      title: stageDef.title,
      description: stageDef.description,
      runtimePreference: stageDef.runtimePreference,
      source: items.some((item) => item.source === "markdown-body")
        ? "markdown-body"
        : "task-type-default",
      items,
      summary,
      state: stageState(summary),
      ...(bodySection ? { bodySection } : {}),
    };
  });

  const authoritativeWorkflow: NormalizedTaskWorkflowAuthoritativeSource =
    usedMarkdownWorkflow && usedDefaultWorkflow
      ? "mixed"
      : usedMarkdownWorkflow
        ? "markdown-body"
        : "task-type-default";
  const authoritativeCompletion: NormalizedTaskWorkflowAuthoritativeSource =
    usedMarkdownCompletion && usedDefaultCompletion
      ? "mixed"
      : usedMarkdownCompletion
        ? "markdown-body"
        : "task-type-default";

  return {
    task: {
      id: frontmatter.id,
      slug: frontmatter.slug,
      title: frontmatter.title,
      lane: frontmatter.lane,
      status: frontmatter.status,
      taskType: frontmatter.taskType,
    },
    workflow: {
      schemaVersion: "2.0",
      template:
        TASK_TYPE_TEMPLATE_MAP[frontmatter.taskType as (typeof KNOWN_TASK_TYPES)[number]] ??
        `task-type-${frontmatter.taskType}`,
      sources: {
        authoritativeWorkflow,
        authoritativeCompletion,
        supportingMarkdownMirror: mirrorState(content),
        supportingSections: supportingSections(sections),
      },
      stages,
      summary: workflowSummary(stages),
    },
  };
}

export function parseTaskWorkflowDocument(
  rawContent: string,
  filePath?: string,
): NormalizedTaskWorkflow {
  const { frontmatterLines, content } = splitFrontmatter(rawContent);
  const rawFrontmatter = {
    id: parseStringValue(frontmatterLines, "id"),
    slug: parseStringValue(frontmatterLines, "slug"),
    title: parseStringValue(frontmatterLines, "title"),
    lane: parseStringValue(frontmatterLines, "lane"),
    status: parseStringValue(frontmatterLines, "status"),
    taskType: parseStringValue(frontmatterLines, "taskType"),
    tags: parseStringArray(frontmatterLines, "tags"),
    acceptanceChecks: parseStringArray(frontmatterLines, "acceptanceChecks"),
    completionCriteria: parseStringArray(frontmatterLines, "completionCriteria"),
    evidence: parseStringArray(frontmatterLines, "evidence"),
    traceLinks: parseStringArray(frontmatterLines, "traceLinks"),
    workflow: parseWorkflow(frontmatterLines),
  } satisfies Record<string, unknown>;
  const sections = parseSections(content);
  const frontmatter = parseFrontmatter(rawFrontmatter, filePath);
  frontmatter.taskType =
    frontmatter.taskType ??
    inferTaskType(frontmatter.title, frontmatter.slug, frontmatter.tags, sections);

  return frontmatter.workflow
    ? buildExplicitWorkflow(frontmatter, sections, content)
    : buildFallbackWorkflow(frontmatter, sections, content);
}
