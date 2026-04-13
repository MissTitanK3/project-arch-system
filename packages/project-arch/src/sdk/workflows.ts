import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import {
  deriveNormalizedTaskWorkflowStageState,
  knownTaskTypeValues,
  normalizedTaskWorkflowSchema,
  summarizeNormalizedTaskWorkflowStages,
  summarizeTaskWorkflowItems,
  taskTypeSchema,
  taskWorkflowMetadataSchema,
  type KnownTaskType,
  type NormalizedTaskWorkflow,
  type NormalizedTaskWorkflowAuthoritativeSource,
  type NormalizedTaskWorkflowBodySectionKind,
  type NormalizedTaskWorkflowBodySectionRef,
  type NormalizedTaskWorkflowItem,
  type NormalizedTaskWorkflowLane,
  type NormalizedTaskWorkflowMirrorState,
  type NormalizedTaskWorkflowNodeSource,
  type NormalizedTaskWorkflowStage,
  type NormalizedTaskWorkflowStageState,
  type NormalizedTaskWorkflowSummary,
  type TaskType,
  type TaskWorkflowCompletionSummary,
  type TaskWorkflowEvidencePath,
  type TaskWorkflowId,
  type TaskWorkflowItem,
  type TaskWorkflowItemStatus,
  type TaskWorkflowMetadata,
  type TaskWorkflowRuntimePreference,
  type TaskWorkflowSchemaVersion,
  type TaskWorkflowStage,
  type TaskWorkflowTemplate,
} from "../schemas/taskWorkflow";

interface ParsedTaskWorkflowFrontmatter {
  id: string;
  slug: string;
  title: string;
  lane: NormalizedTaskWorkflowLane;
  status: string;
  taskType?: TaskType;
  workflow?: TaskWorkflowMetadata;
  tags: string[];
  codeTargets: string[];
  publicDocs: string[];
  decisions: string[];
  completionCriteria: string[];
  acceptanceChecks: string[];
  evidence: string[];
  traceLinks: string[];
  dependsOn: string[];
  blocks: string[];
}

export interface ParsedTaskWorkflowDocument {
  frontmatter: ParsedTaskWorkflowFrontmatter;
  content: string;
  normalized: NormalizedTaskWorkflow;
}

export interface ParseTaskWorkflowDocumentOptions {
  filePath?: string;
  defaultTaskType?: TaskType;
}

interface MarkdownSection {
  heading: string;
  kind?: NormalizedTaskWorkflowBodySectionKind;
  content: string;
}

interface FallbackStageDefinition {
  id: string;
  title: string;
  description: string;
  runtimePreference: TaskWorkflowRuntimePreference;
  sectionKinds: NormalizedTaskWorkflowBodySectionKind[];
  fallbackLabels: string[];
}

const TOP_LEVEL_SECTION_KIND_BY_HEADING: Record<string, NormalizedTaskWorkflowBodySectionKind> = {
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

const TASK_TYPE_TEMPLATE_MAP: Record<KnownTaskType, string> = {
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeHeading(heading: string): string {
  return heading.trim().toLowerCase();
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "item";
}

function allocateUniqueId(baseId: string, usedIds: Set<string>): string {
  const candidate = slugify(baseId);
  if (!usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let suffix = 2;
  while (usedIds.has(`${candidate}-${suffix}`)) {
    suffix += 1;
  }

  const unique = `${candidate}-${suffix}`;
  usedIds.add(unique);
  return unique;
}

function fileBaseName(filePath?: string): string | undefined {
  return filePath ? path.basename(filePath, path.extname(filePath)) : undefined;
}

function inferTaskId(raw: Record<string, unknown>, filePath?: string): string {
  if (typeof raw.id === "string" && /^\d{3}$/.test(raw.id.trim())) {
    return raw.id.trim();
  }

  const basename = fileBaseName(filePath);
  const match = basename?.match(/^(\d{3})-/);
  return match?.[1] ?? "000";
}

function inferTaskTitle(raw: Record<string, unknown>, filePath?: string): string {
  if (typeof raw.title === "string" && raw.title.trim().length > 0) {
    return raw.title.trim();
  }

  const basename = fileBaseName(filePath);
  if (!basename) {
    return "Untitled task";
  }

  return (
    basename
      .replace(/^\d{3}-/, "")
      .replace(/-/g, " ")
      .trim() || basename
  );
}

function inferTaskSlug(
  raw: Record<string, unknown>,
  filePath: string | undefined,
  title: string,
): string {
  if (typeof raw.slug === "string" && raw.slug.trim().length > 0) {
    return slugify(raw.slug.trim());
  }

  const basename = fileBaseName(filePath);
  if (basename) {
    return slugify(basename.replace(/^\d{3}-/, ""));
  }

  return slugify(title);
}

function inferLane(raw: Record<string, unknown>, filePath?: string): NormalizedTaskWorkflowLane {
  if (raw.lane === "planned" || raw.lane === "discovered" || raw.lane === "backlog") {
    return raw.lane;
  }

  if (filePath) {
    const normalizedPath = filePath.split(path.sep).join("/");
    const match = normalizedPath.match(/\/tasks\/(planned|discovered|backlog)\//);
    if (match?.[1] === "planned" || match?.[1] === "discovered" || match?.[1] === "backlog") {
      return match[1];
    }
  }

  return "planned";
}

function inferStatus(raw: Record<string, unknown>, lane: string): string {
  if (typeof raw.status === "string" && raw.status.trim().length > 0) {
    return raw.status.trim();
  }

  return lane;
}

function parseMarkdownSections(content: string): MarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentHeading: string | undefined;
  let currentContent: string[] = [];

  const pushCurrent = (): void => {
    if (!currentHeading) {
      return;
    }

    sections.push({
      heading: currentHeading,
      kind: TOP_LEVEL_SECTION_KIND_BY_HEADING[normalizeHeading(currentHeading)],
      content: currentContent.join("\n").trimEnd(),
    });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      pushCurrent();
      currentHeading = headingMatch[1]?.trim();
      currentContent = [];
      continue;
    }

    if (currentHeading) {
      currentContent.push(line);
    }
  }

  pushCurrent();
  return sections;
}

function detectMarkdownMirrorState(content: string): NormalizedTaskWorkflowMirrorState {
  return /^\s*-\s+\[[ xX]\]\s+/m.test(content) ? "present" : "absent";
}

function supportingSectionsFromMarkdown(
  sections: MarkdownSection[],
): NormalizedTaskWorkflowBodySectionRef[] {
  return sections
    .filter(
      (section): section is MarkdownSection & { kind: NormalizedTaskWorkflowBodySectionKind } =>
        Boolean(section.kind),
    )
    .map((section) => ({ kind: section.kind, heading: section.heading }));
}

function firstSectionRef(
  sections: MarkdownSection[],
  kinds: readonly NormalizedTaskWorkflowBodySectionKind[],
): NormalizedTaskWorkflowBodySectionRef | undefined {
  const match = sections.find((section) => section.kind && kinds.includes(section.kind));
  return match?.kind ? { kind: match.kind, heading: match.heading } : undefined;
}

function parseChecklistAndBulletLabels(
  content: string,
): Array<{ label: string; status: "planned" | "done" }> {
  const items: Array<{ label: string; status: "planned" | "done" }> = [];

  for (const line of content.split(/\r?\n/)) {
    const checklistMatch = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (checklistMatch) {
      items.push({
        label: checklistMatch[2]?.trim() ?? "",
        status: checklistMatch[1]?.toLowerCase() === "x" ? "done" : "planned",
      });
      continue;
    }

    const bulletMatch = line.match(/^\s*-\s+(.+)$/);
    if (bulletMatch) {
      items.push({ label: bulletMatch[1]?.trim() ?? "", status: "planned" });
    }
  }

  return items.filter((item) => item.label.length > 0 && item.label !== "...");
}

function parseDependencySectionItems(section: MarkdownSection | undefined): string[] {
  if (!section) {
    return [];
  }

  const lines = section.content.split(/\r?\n/);
  const output: string[] = [];
  let currentSubheading: string | undefined;

  for (const line of lines) {
    const subheadingMatch = line.match(/^###\s+(.+)$/);
    if (subheadingMatch) {
      currentSubheading = normalizeHeading(subheadingMatch[1] ?? "");
      continue;
    }

    const bulletMatch = line.match(/^\s*-\s+(.+)$/);
    if (!bulletMatch) {
      continue;
    }

    const text = bulletMatch[1]?.trim() ?? "";
    if (text === "..." || text.length === 0) {
      continue;
    }

    if (currentSubheading === "depends on") {
      output.push(`Inspect dependency ${text}`);
    } else if (currentSubheading === "blocks") {
      output.push(`Track blocker relationship for ${text}`);
    } else {
      output.push(text);
    }
  }

  return output;
}

function createNormalizedItem(input: {
  usedIds: Set<string>;
  preferredIdBase: string;
  label: string;
  status: NormalizedTaskWorkflowItem["status"];
  runtimePreference: TaskWorkflowRuntimePreference;
  source: NormalizedTaskWorkflowNodeSource;
  bodySection?: NormalizedTaskWorkflowBodySectionRef;
  evidencePaths?: string[];
}): NormalizedTaskWorkflowItem {
  return {
    id: allocateUniqueId(input.preferredIdBase, input.usedIds),
    label: input.label,
    status: input.status,
    runtimePreference: input.runtimePreference,
    source: input.source,
    evidencePaths: input.evidencePaths ?? [],
    ...(input.bodySection ? { bodySection: input.bodySection } : {}),
  };
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

function fallbackStageDefinitions(taskType: TaskType): FallbackStageDefinition[] {
  return [
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
      runtimePreference: runtimePreferenceForTaskType(taskType),
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
}

function inferTaskTypeFromContext(input: {
  explicitTaskType?: unknown;
  defaultTaskType?: TaskType;
  title: string;
  slug: string;
  tags: string[];
  sections: MarkdownSection[];
}): TaskType {
  if (typeof input.explicitTaskType === "string") {
    const parsed = taskTypeSchema.safeParse(input.explicitTaskType.trim());
    if (parsed.success) {
      return parsed.data;
    }
  }

  if (input.defaultTaskType) {
    return input.defaultTaskType;
  }

  const tags = new Set(input.tags.map((tag) => tag.toLowerCase()));
  for (const taskType of knownTaskTypeValues) {
    if (tags.has(taskType)) {
      return taskType;
    }
  }

  const haystack =
    `${input.title} ${input.slug} ${input.sections.map((section) => section.heading).join(" ")}`.toLowerCase();
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

function templateForTaskType(taskType: TaskType): string {
  return (knownTaskTypeValues as readonly string[]).includes(taskType)
    ? TASK_TYPE_TEMPLATE_MAP[taskType as KnownTaskType]
    : `task-type-${taskType}`;
}

function parseFrontmatter(
  raw: Record<string, unknown>,
  options: ParseTaskWorkflowDocumentOptions,
): ParsedTaskWorkflowFrontmatter {
  const title = inferTaskTitle(raw, options.filePath);
  const slug = inferTaskSlug(raw, options.filePath, title);
  const lane = inferLane(raw, options.filePath);
  const workflow = taskWorkflowMetadataSchema.safeParse(raw.workflow).success
    ? taskWorkflowMetadataSchema.parse(raw.workflow)
    : undefined;
  const explicitTaskType = taskTypeSchema.safeParse(raw.taskType).success
    ? taskTypeSchema.parse(raw.taskType)
    : undefined;

  return {
    id: inferTaskId(raw, options.filePath),
    slug,
    title,
    lane,
    status: inferStatus(raw, lane),
    taskType: explicitTaskType,
    workflow,
    tags: toStringArray(raw.tags),
    codeTargets: toStringArray(raw.codeTargets),
    publicDocs: toStringArray(raw.publicDocs),
    decisions: toStringArray(raw.decisions),
    completionCriteria: toStringArray(raw.completionCriteria),
    acceptanceChecks: toStringArray(raw.acceptanceChecks),
    evidence: toStringArray(raw.evidence),
    traceLinks: toStringArray(raw.traceLinks),
    dependsOn: toStringArray(raw.dependsOn),
    blocks: toStringArray(raw.blocks),
  };
}

function buildFrontmatterStageItems(input: {
  stage: TaskWorkflowMetadata["stages"][number];
  usedIds: Set<string>;
  bodySection?: NormalizedTaskWorkflowBodySectionRef;
}): NormalizedTaskWorkflowItem[] {
  return input.stage.items.map((item) => ({
    id: allocateUniqueId(item.id, input.usedIds),
    label: item.label,
    status: item.status,
    runtimePreference: input.stage.runtimePreference,
    source: "frontmatter",
    evidencePaths: item.evidencePaths ?? [],
    ...(item.notes ? { notes: item.notes } : {}),
    ...(item.commandHint ? { commandHint: item.commandHint } : {}),
    ...(input.bodySection ? { bodySection: input.bodySection } : {}),
  }));
}

function buildExplicitWorkflowNormalized(input: {
  frontmatter: ParsedTaskWorkflowFrontmatter;
  sections: MarkdownSection[];
  content: string;
  taskType: TaskType;
  workflow: TaskWorkflowMetadata;
}): NormalizedTaskWorkflow {
  const stageIds = new Set<string>();
  const itemIds = new Set<string>();
  const stages: NormalizedTaskWorkflowStage[] = input.workflow.stages.map((stage) => {
    const bodySection = firstSectionRef(
      input.sections,
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
    const items = buildFrontmatterStageItems({
      stage,
      usedIds: itemIds,
      bodySection,
    });
    const summary = summarizeTaskWorkflowItems(items);

    return {
      id: allocateUniqueId(stage.id, stageIds),
      title: stage.title,
      runtimePreference: stage.runtimePreference,
      source: "frontmatter",
      items,
      summary,
      state: deriveNormalizedTaskWorkflowStageState(summary),
      ...(stage.description ? { description: stage.description } : {}),
      ...(bodySection ? { bodySection } : {}),
    };
  });

  return normalizedTaskWorkflowSchema.parse({
    task: {
      id: input.frontmatter.id,
      slug: input.frontmatter.slug,
      title: input.frontmatter.title,
      lane: input.frontmatter.lane,
      status: input.frontmatter.status,
      taskType: input.taskType,
    },
    workflow: {
      schemaVersion: "2.0",
      template: input.workflow.template,
      sources: {
        authoritativeWorkflow: "frontmatter",
        authoritativeCompletion: "frontmatter",
        supportingMarkdownMirror: detectMarkdownMirrorState(input.content),
        supportingSections: supportingSectionsFromMarkdown(input.sections),
      },
      stages,
      summary: summarizeNormalizedTaskWorkflowStages(stages),
    },
  });
}

function buildFallbackWorkflowNormalized(input: {
  frontmatter: ParsedTaskWorkflowFrontmatter;
  sections: MarkdownSection[];
  content: string;
  taskType: TaskType;
}): NormalizedTaskWorkflow {
  const sectionByKind = new Map<NormalizedTaskWorkflowBodySectionKind, MarkdownSection>();
  for (const section of input.sections) {
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

  const stages: NormalizedTaskWorkflowStage[] = fallbackStageDefinitions(input.taskType).map(
    (definition) => {
      const stageBodySection = firstSectionRef(input.sections, definition.sectionKinds);
      const items: NormalizedTaskWorkflowItem[] = [];

      for (const kind of definition.sectionKinds) {
        const section = sectionByKind.get(kind);
        if (!section) {
          continue;
        }

        if (kind === "dependencies") {
          for (const label of parseDependencySectionItems(section)) {
            usedMarkdownWorkflow = true;
            usedMarkdownCompletion = true;
            items.push(
              createNormalizedItem({
                usedIds: itemIds,
                preferredIdBase: label,
                label,
                status: "planned",
                runtimePreference: definition.runtimePreference,
                source: "markdown-body",
                bodySection: { kind, heading: section.heading },
              }),
            );
          }
          continue;
        }

        for (const parsedItem of parseChecklistAndBulletLabels(section.content)) {
          usedMarkdownWorkflow = true;
          usedMarkdownCompletion = true;
          items.push(
            createNormalizedItem({
              usedIds: itemIds,
              preferredIdBase: parsedItem.label,
              label: parsedItem.label,
              status: parsedItem.status,
              runtimePreference: definition.runtimePreference,
              source: "markdown-body",
              bodySection: { kind, heading: section.heading },
              evidencePaths: kind === "evidence" ? [parsedItem.label] : [],
            }),
          );
        }
      }

      if (definition.id === "validation" && items.length === 0) {
        const checks = [
          ...input.frontmatter.acceptanceChecks,
          ...input.frontmatter.completionCriteria,
        ].filter((value, index, array) => array.indexOf(value) === index);
        const acceptanceSection = sectionByKind.get("acceptance-checks");
        for (const check of checks) {
          usedMarkdownWorkflow = true;
          usedMarkdownCompletion = true;
          items.push(
            createNormalizedItem({
              usedIds: itemIds,
              preferredIdBase: check,
              label: check,
              status: "planned",
              runtimePreference: definition.runtimePreference,
              source: "markdown-body",
              bodySection: acceptanceSection
                ? { kind: "acceptance-checks", heading: acceptanceSection.heading }
                : undefined,
            }),
          );
        }
      }

      if (definition.id === "follow-up-closure" && items.length === 0) {
        for (const evidencePath of input.frontmatter.evidence) {
          usedMarkdownWorkflow = true;
          usedMarkdownCompletion = true;
          items.push(
            createNormalizedItem({
              usedIds: itemIds,
              preferredIdBase: `evidence-${evidencePath}`,
              label: `Collect evidence ${evidencePath}`,
              status: "planned",
              runtimePreference: definition.runtimePreference,
              source: "markdown-body",
              bodySection: stageBodySection,
              evidencePaths: [evidencePath],
            }),
          );
        }

        for (const traceLink of input.frontmatter.traceLinks) {
          usedMarkdownWorkflow = true;
          usedMarkdownCompletion = true;
          items.push(
            createNormalizedItem({
              usedIds: itemIds,
              preferredIdBase: `trace-${traceLink}`,
              label: `Record trace link ${traceLink}`,
              status: "planned",
              runtimePreference: definition.runtimePreference,
              source: "markdown-body",
              bodySection: stageBodySection,
            }),
          );
        }
      }

      if (items.length === 0) {
        usedDefaultWorkflow = true;
        usedDefaultCompletion = true;
        for (const fallbackLabel of definition.fallbackLabels) {
          items.push(
            createNormalizedItem({
              usedIds: itemIds,
              preferredIdBase: `${definition.id}-${fallbackLabel}`,
              label: fallbackLabel,
              status: "planned",
              runtimePreference: definition.runtimePreference,
              source: "task-type-default",
              bodySection: stageBodySection,
            }),
          );
        }
      }

      const summary = summarizeTaskWorkflowItems(items);
      return {
        id: allocateUniqueId(definition.id, stageIds),
        title: definition.title,
        description: definition.description,
        runtimePreference: definition.runtimePreference,
        source: items.some((item) => item.source === "markdown-body")
          ? "markdown-body"
          : "task-type-default",
        items,
        summary,
        state: deriveNormalizedTaskWorkflowStageState(summary),
        ...(stageBodySection ? { bodySection: stageBodySection } : {}),
      };
    },
  );

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

  return normalizedTaskWorkflowSchema.parse({
    task: {
      id: input.frontmatter.id,
      slug: input.frontmatter.slug,
      title: input.frontmatter.title,
      lane: input.frontmatter.lane,
      status: input.frontmatter.status,
      taskType: input.taskType,
    },
    workflow: {
      schemaVersion: "2.0",
      template: templateForTaskType(input.taskType),
      sources: {
        authoritativeWorkflow,
        authoritativeCompletion,
        supportingMarkdownMirror: detectMarkdownMirrorState(input.content),
        supportingSections: supportingSectionsFromMarkdown(input.sections),
      },
      stages,
      summary: summarizeNormalizedTaskWorkflowStages(stages),
    },
  });
}

export function parseTaskWorkflowDocument(
  rawContent: string,
  options: ParseTaskWorkflowDocumentOptions = {},
): ParsedTaskWorkflowDocument {
  const parsedMatter = matter(rawContent);
  const rawFrontmatter = isRecord(parsedMatter.data) ? parsedMatter.data : {};
  const content = parsedMatter.content;
  const sections = parseMarkdownSections(content);
  const frontmatter = parseFrontmatter(rawFrontmatter, options);
  const taskType = inferTaskTypeFromContext({
    explicitTaskType: frontmatter.taskType,
    defaultTaskType: options.defaultTaskType,
    title: frontmatter.title,
    slug: frontmatter.slug,
    tags: frontmatter.tags,
    sections,
  });

  const normalized = frontmatter.workflow
    ? buildExplicitWorkflowNormalized({
        frontmatter,
        sections,
        content,
        taskType,
        workflow: frontmatter.workflow,
      })
    : buildFallbackWorkflowNormalized({
        frontmatter,
        sections,
        content,
        taskType,
      });

  return {
    frontmatter: {
      ...frontmatter,
      taskType,
    },
    content,
    normalized,
  };
}

export async function readTaskWorkflowDocument(
  filePath: string,
  options: Omit<ParseTaskWorkflowDocumentOptions, "filePath"> = {},
): Promise<ParsedTaskWorkflowDocument> {
  const content = await fs.readFile(filePath, "utf8");
  return parseTaskWorkflowDocument(content, {
    ...options,
    filePath,
  });
}

export {
  deriveNormalizedTaskWorkflowStageState,
  knownTaskTypeSchema,
  knownTaskTypeValues,
  normalizedTaskWorkflowAuthoritativeSourceSchema,
  normalizedTaskWorkflowBodySectionKindSchema,
  normalizedTaskWorkflowBodySectionRefSchema,
  normalizedTaskWorkflowItemSchema,
  normalizedTaskWorkflowLaneSchema,
  normalizedTaskWorkflowMirrorStateSchema,
  normalizedTaskWorkflowNodeSourceSchema,
  normalizedTaskWorkflowSchema,
  normalizedTaskWorkflowStageSchema,
  normalizedTaskWorkflowStageStateSchema,
  normalizedTaskWorkflowSummarySchema,
  summarizeNormalizedTaskWorkflowStages,
  summarizeTaskWorkflowItems,
  summarizeTaskWorkflowItemStatuses,
  taskTypeSchema,
  taskWorkflowCompletionSummarySchema,
  taskWorkflowEvidencePathSchema,
  taskWorkflowIdSchema,
  taskWorkflowItemSchema,
  taskWorkflowItemStatusSchema,
  taskWorkflowMetadataSchema,
  taskWorkflowRuntimePreferenceSchema,
  taskWorkflowSchemaVersionSchema,
  taskWorkflowStageSchema,
  taskWorkflowTemplateSchema,
} from "../schemas/taskWorkflow";

export type {
  KnownTaskType,
  NormalizedTaskWorkflow,
  NormalizedTaskWorkflowAuthoritativeSource,
  NormalizedTaskWorkflowBodySectionKind,
  NormalizedTaskWorkflowBodySectionRef,
  NormalizedTaskWorkflowItem,
  NormalizedTaskWorkflowLane,
  NormalizedTaskWorkflowMirrorState,
  NormalizedTaskWorkflowNodeSource,
  NormalizedTaskWorkflowStage,
  NormalizedTaskWorkflowStageState,
  NormalizedTaskWorkflowSummary,
  TaskType,
  TaskWorkflowCompletionSummary,
  TaskWorkflowEvidencePath,
  TaskWorkflowId,
  TaskWorkflowItem,
  TaskWorkflowItemStatus,
  TaskWorkflowMetadata,
  TaskWorkflowRuntimePreference,
  TaskWorkflowSchemaVersion,
  TaskWorkflowStage,
  TaskWorkflowTemplate,
};
