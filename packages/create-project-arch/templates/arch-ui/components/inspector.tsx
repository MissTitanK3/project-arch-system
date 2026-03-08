"use client";

import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Code } from "@repo/ui/code";
import { Separator } from "@repo/ui/separator";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { getArchitectureMap, getGraphDataset, getNodeFiles, getTaskTrace } from "../lib/api";
import { ArchitectureMapData, GraphValidationIssueData } from "../lib/types";
import { MarkdownViewer } from "./markdown-viewer";
import { useInspector } from "./inspector-context";
import { useWorkspace } from "./workspace-context";

type TracePayload = {
  task?: string;
  decisionRefs?: string[];
  moduleRefs?: string[];
  files?: string[];
};

type EntityDetails = {
  summary: Array<{ label: string; value: string }>;
  relatedTasks: string[];
  relatedMilestones: string[];
  relatedDecisions: string[];
  relatedModules: string[];
};

type MetadataRecord = {
  label: string;
  value: string;
};

type FrontmatterValue = string | string[] | null;
type FrontmatterData = Record<string, FrontmatterValue>;

function parseFrontmatter(markdown: string): FrontmatterData {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return {};
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return {};

  const body = normalized.slice(4, end);
  const lines = body.split("\n");
  const entries: FrontmatterData = {};
  let currentKey: string | null = null;
  let arrayValues: string[] = [];

  function flushArray() {
    if (!currentKey) return;
    entries[currentKey] = arrayValues;
    currentKey = null;
    arrayValues = [];
  }

  function normalizeScalar(value: string): FrontmatterValue {
    const unquoted = value.replace(/^['"]|['"]$/g, "").trim();
    if (unquoted.toLowerCase() === "null") return null;
    if (unquoted === "[]") return [];
    if (/^\[.*\]$/.test(unquoted)) {
      const inner = unquoted.slice(1, -1).trim();
      if (!inner) return [];
      return inner
        .split(",")
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
    return unquoted;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentKey) {
      const normalizedItem = normalizeScalar(arrayMatch[1]?.trim() ?? "");
      if (typeof normalizedItem === "string" && normalizedItem.length > 0) {
        arrayValues.push(normalizedItem);
      }
      continue;
    }

    flushArray();
    const keyValueMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyValueMatch) continue;

    const key = keyValueMatch[1] ?? "";
    const rawValue = (keyValueMatch[2] ?? "").trim();
    if (rawValue === "") {
      currentKey = key;
      arrayValues = [];
      continue;
    }
    entries[key] = normalizeScalar(rawValue);
  }

  flushArray();
  return entries;
}

function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return markdown;
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return markdown;
  }
  return normalized.slice(end + 5).trimStart();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function isTaskLikeType(type: string): type is "task" | "milestone" | "phase" {
  return type === "task" || type === "milestone" || type === "phase";
}

function isFileBackedType(
  type: string,
): type is "task" | "milestone" | "phase" | "domain" | "file" {
  return (
    type === "task" ||
    type === "milestone" ||
    type === "phase" ||
    type === "domain" ||
    type === "file"
  );
}

function normalizeKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function humanizeSlug(slug: string): string {
  if (!slug) return "n/a";
  const converted = slug
    .replace(/[_-]+/g, " ")
    .replace(/\b(\d+)\b/g, "$1")
    .trim();
  return titleCase(converted);
}

function humanizeLabel(label: string): string {
  const cleaned = label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return titleCase(cleaned);
}

function humanizeValue(label: string, value: string): string {
  if (!value) return "n/a";

  const key = normalizeKey(label);
  if (key === "lane" || key === "status") {
    if (value.toLowerCase() === "todo") return "To Do";
    return humanizeSlug(value);
  }

  if (key === "domain") {
    return value === "unassigned" ? "Unassigned" : humanizeSlug(value);
  }

  if (key.includes("count")) {
    return value;
  }

  if (key === "graphnode") {
    return value;
  }

  if (value.includes("/")) {
    return value
      .split("/")
      .map((segment) => humanizeSlug(segment))
      .join(" > ");
  }

  if (/^[a-z0-9-]+$/.test(value)) {
    return humanizeSlug(value);
  }

  return value;
}

function parseTaskId(taskId: string): {
  phaseId?: string;
  milestoneId?: string;
  taskNumber?: string;
} {
  const [phaseId, milestoneId, taskNumber] = taskId.split("/");
  return {
    phaseId: phaseId || undefined,
    milestoneId: milestoneId || undefined,
    taskNumber: taskNumber || undefined,
  };
}

function isDateLikeValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateValue(value: string): string {
  if (!isDateLikeValue(value)) return value;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function createMetadataMap(entries: MetadataRecord[]): Map<string, MetadataRecord> {
  const map = new Map<string, MetadataRecord>();
  entries.forEach((entry) => {
    const key = normalizeKey(entry.label);
    if (!map.has(key) && entry.value) {
      map.set(key, entry);
    }
  });
  return map;
}

function getMetadataValue(map: Map<string, MetadataRecord>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const entry = map.get(normalizeKey(key));
    if (entry?.value) return entry.value;
  }
  return undefined;
}

function deriveEntityDetails(
  map: ArchitectureMapData,
  selectionType: "task" | "milestone" | "phase",
  selectionId: string,
): EntityDetails {
  if (selectionType === "task") {
    const task = map.nodes.tasks.find((item) => item.id === selectionId);
    const milestone = task ? map.nodes.milestones.find((m) => m.id === task.milestone) : null;
    const decisions = uniqueSorted(
      map.edges.taskToDecision
        .filter((edge) => edge.task === selectionId)
        .map((edge) => edge.decision),
    );
    const modules = uniqueSorted(
      map.edges.taskToModule.filter((edge) => edge.task === selectionId).map((edge) => edge.module),
    );

    return {
      summary: [
        { label: "Task ID", value: selectionId },
        { label: "Title", value: task?.title ?? "n/a" },
        { label: "Lane", value: task?.lane ?? "n/a" },
        { label: "Status", value: task?.status ?? "n/a" },
        { label: "Domain", value: task?.domain ?? "unassigned" },
        { label: "Milestone", value: task?.milestone ?? "n/a" },
        { label: "Phase", value: milestone?.phaseId ?? "n/a" },
      ],
      relatedTasks: [selectionId],
      relatedMilestones: uniqueSorted(task?.milestone ? [task.milestone] : []),
      relatedDecisions: decisions,
      relatedModules: modules,
    };
  }

  if (selectionType === "milestone") {
    const milestone = map.nodes.milestones.find((item) => item.id === selectionId);
    const taskIds = uniqueSorted(
      map.edges.milestoneToTask
        .filter((edge) => edge.milestone === selectionId)
        .map((edge) => edge.task),
    );
    const taskIdSet = new Set(taskIds);
    const decisions = uniqueSorted(
      map.edges.taskToDecision
        .filter((edge) => taskIdSet.has(edge.task))
        .map((edge) => edge.decision),
    );
    const modules = uniqueSorted(
      map.edges.taskToModule.filter((edge) => taskIdSet.has(edge.task)).map((edge) => edge.module),
    );

    return {
      summary: [
        { label: "Milestone ID", value: selectionId },
        { label: "Phase", value: milestone?.phaseId ?? "n/a" },
        { label: "Milestone Slug", value: milestone?.milestoneId ?? "n/a" },
        { label: "Task Count", value: String(taskIds.length) },
        { label: "Decision Count", value: String(decisions.length) },
        { label: "Module Count", value: String(modules.length) },
      ],
      relatedTasks: taskIds,
      relatedMilestones: [selectionId],
      relatedDecisions: decisions,
      relatedModules: modules,
    };
  }

  const phaseMilestones = uniqueSorted(
    map.nodes.milestones.filter((item) => item.phaseId === selectionId).map((item) => item.id),
  );
  const milestoneSet = new Set(phaseMilestones);
  const taskIds = uniqueSorted(
    map.edges.milestoneToTask
      .filter((edge) => milestoneSet.has(edge.milestone))
      .map((edge) => edge.task),
  );
  const taskIdSet = new Set(taskIds);
  const decisions = uniqueSorted(
    map.edges.taskToDecision
      .filter((edge) => taskIdSet.has(edge.task))
      .map((edge) => edge.decision),
  );
  const modules = uniqueSorted(
    map.edges.taskToModule.filter((edge) => taskIdSet.has(edge.task)).map((edge) => edge.module),
  );

  return {
    summary: [
      { label: "Phase ID", value: selectionId },
      { label: "Milestone Count", value: String(phaseMilestones.length) },
      { label: "Task Count", value: String(taskIds.length) },
      { label: "Decision Count", value: String(decisions.length) },
      { label: "Module Count", value: String(modules.length) },
    ],
    relatedTasks: taskIds,
    relatedMilestones: phaseMilestones,
    relatedDecisions: decisions,
    relatedModules: modules,
  };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="m-0 leading-tight">
      <span className="text-slate-400">{humanizeLabel(label)}</span>
      <br />
      {humanizeValue(label, value)}
    </p>
  );
}

function RelatedList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return (
      <p className="m-0 leading-tight">
        <span className="text-slate-400">{label}</span>
        <br />
        <span className="text-slate-500">None</span>
      </p>
    );
  }

  return (
    <div className="grid gap-1.5">
      <p className="m-0 text-slate-400">{label}</p>
      <div className="grid gap-1.5">
        {values.map((value) => (
          <div key={`${label}:${value}`} className="grid gap-1">
            <p className="text-sm text-slate-200">{humanizeValue(label, value)}</p>
            <Code>{value}</Code>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 rounded-xl border border-slate-700/80 bg-slate-900/40 p-3">
      <p className="m-0 text-xs uppercase tracking-[0.08em] text-slate-400">{title}</p>
      {children}
    </section>
  );
}

function MetadataDetails({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="rounded-lg border border-slate-700/70 bg-slate-900/30 p-2 [&_summary::-webkit-details-marker]:hidden"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none text-sm font-medium text-slate-200">
        {title}
      </summary>
      <div className="mt-2 grid gap-2">{children}</div>
    </details>
  );
}

function MetadataValue({ label, value }: { label: string; value: FrontmatterValue }) {
  if (value === null) {
    return (
      <div className="grid gap-1">
        <p className="m-0 text-xs uppercase tracking-[0.06em] text-slate-400">
          {humanizeLabel(label)}
        </p>
        <p className="m-0 text-sm text-slate-500">None</p>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="grid gap-1">
          <p className="m-0 text-xs uppercase tracking-[0.06em] text-slate-400">
            {humanizeLabel(label)}
          </p>
          <p className="m-0 text-sm text-slate-500">None</p>
        </div>
      );
    }

    const listLike = normalizeKey(label).includes("criteria");
    return (
      <div className="grid gap-1.5">
        <p className="m-0 text-xs uppercase tracking-[0.06em] text-slate-400">
          {humanizeLabel(label)}
        </p>
        {listLike ? (
          <ol className="m-0 grid list-decimal gap-1 pl-5 text-sm text-slate-200">
            {value.map((item) => (
              <li key={`${label}:${item}`}>{humanizeValue(label, item)}</li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {value.map((item) => (
              <Badge key={`${label}:${item}`} variant="secondary">
                {humanizeValue(label, item)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <Field label={label} value={formatDateValue(value)} />;
}

export function InspectorPanel() {
  const { selection, setSelection } = useInspector();
  const { rightCollapsed, setRightCollapsed } = useWorkspace();
  const [trace, setTrace] = useState<TracePayload | null>(null);
  const [levelFiles, setLevelFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [selectedLevelFilePath, setSelectedLevelFilePath] = useState<string | null>(null);
  const [entityDetails, setEntityDetails] = useState<EntityDetails | null>(null);
  const [graphWarnings, setGraphWarnings] = useState<GraphValidationIssueData[]>([]);

  const selectedLevelFile = selectedLevelFilePath
    ? (levelFiles.find((file) => file.path === selectedLevelFilePath) ?? null)
    : null;
  const selectedLevelFileExt = selectedLevelFile
    ? (selectedLevelFile.path.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const selectedLevelFileFrontmatter = selectedLevelFile
    ? parseFrontmatter(selectedLevelFile.content)
    : {};
  const selectedLevelFileFrontmatterEntries = Object.entries(selectedLevelFileFrontmatter);
  const [showEmptyFileMetadata, setShowEmptyFileMetadata] = useState(false);

  const fileMetadataGroups = useMemo(() => {
    const keyOrder = {
      identity: ["schemaVersion", "id", "slug", "title"],
      workflow: ["lane", "status", "createdAt", "updatedAt", "discoveredFromTask"],
      references: ["tags", "codeTargets", "publicDocs", "decisions"],
      criteria: ["completionCriteria"],
    } as const;

    const sourceEntries = new Map(selectedLevelFileFrontmatterEntries);
    const pick = (keys: readonly string[]) =>
      keys
        .filter((key) => sourceEntries.has(key))
        .map((key) => [key, sourceEntries.get(key) ?? null] as const)
        .filter(
          ([, value]) =>
            showEmptyFileMetadata ||
            !(value === null || (Array.isArray(value) && value.length === 0)),
        );

    return {
      identity: pick(keyOrder.identity),
      workflow: pick(keyOrder.workflow),
      references: pick(keyOrder.references),
      criteria: pick(keyOrder.criteria),
      summary: [
        ["id", sourceEntries.get("id") ?? null] as const,
        ["schemaVersion", sourceEntries.get("schemaVersion") ?? null] as const,
        ["createdAt", sourceEntries.get("createdAt") ?? null] as const,
        ["updatedAt", sourceEntries.get("updatedAt") ?? null] as const,
      ].filter(([, value]) => value !== null && !(Array.isArray(value) && value.length === 0)),
    };
  }, [selectedLevelFileFrontmatterEntries, showEmptyFileMetadata]);

  const taskLikeType = selection?.type && isTaskLikeType(selection.type) ? selection.type : null;
  const fileBackedType =
    selection?.type && isFileBackedType(selection.type) ? selection.type : null;
  const selectionId = selection?.id ?? null;
  const isFileSelection = selection?.type === "file";
  const hasFileDocument = Boolean(selectedLevelFile);
  const fileLaneValue = selectedLevelFileFrontmatter.lane;
  const fileStatusValue = selectedLevelFileFrontmatter.status;
  const filteredSelectionMetadata = (selection?.metadata ?? []).filter((item) => {
    if (!isFileSelection) return true;
    if (!selectedLevelFile?.path) return true;
    return normalizeKey(item.label) !== "path";
  });

  const rawTaskMetadata = useMemo(() => {
    if (selection?.type !== "task") return [];
    const combined = [...(selection.metadata ?? []), ...(entityDetails?.summary ?? [])];
    const map = createMetadataMap(combined);

    const id = selection.id ?? getMetadataValue(map, "Task ID", "ID") ?? "n/a";
    const parsed = parseTaskId(id);
    const phase = getMetadataValue(map, "Phase") ?? parsed.phaseId ?? "n/a";
    const milestone = getMetadataValue(map, "Milestone") ?? parsed.milestoneId ?? "n/a";
    const taskNumber = parsed.taskNumber ?? "n/a";
    const title = getMetadataValue(map, "Title") ?? selection.title ?? "n/a";
    const lane = getMetadataValue(map, "Lane") ?? "n/a";
    const status = getMetadataValue(map, "Status") ?? "n/a";
    const domain = getMetadataValue(map, "Domain") ?? "unassigned";
    const graphNode = getMetadataValue(map, "Graph Node");

    const ordered: MetadataRecord[] = [
      { label: "Phase", value: phase },
      { label: "Milestone", value: milestone },
      { label: "Task Number", value: taskNumber },
      { label: "Task ID", value: id },
      { label: "Title", value: title },
      { label: "Lane", value: lane },
      { label: "Status", value: status },
      { label: "Domain", value: domain },
    ];

    if (graphNode) {
      ordered.push({ label: "Graph Node", value: graphNode });
    }

    return ordered;
  }, [entityDetails?.summary, selection]);

  useEffect(() => {
    if (!selection?.id || selection.type !== "task") {
      setTrace(null);
      return;
    }

    void getTaskTrace(selection.id)
      .then((traceResult) => {
        setTrace(traceResult as TracePayload);
      })
      .catch(() => {
        setTrace(null);
      });
  }, [selection]);

  useEffect(() => {
    setEntityDetails(null);

    if (!selectionId || !taskLikeType) {
      return;
    }

    void getArchitectureMap()
      .then((map) => {
        setEntityDetails(deriveEntityDetails(map, taskLikeType, selectionId));
      })
      .catch(() => {
        setEntityDetails(null);
      });
  }, [selectionId, taskLikeType]);

  useEffect(() => {
    setLevelFiles([]);
    setSelectedLevelFilePath(null);

    if (!selectionId || !fileBackedType) {
      return;
    }

    void getNodeFiles(fileBackedType, selectionId)
      .then((result) => {
        setLevelFiles(result.files);
        const preferred =
          result.files.find((file) => file.path.endsWith(".md"))?.path ??
          result.files[0]?.path ??
          null;
        setSelectedLevelFilePath(preferred);
      })
      .catch(() => {
        setLevelFiles([]);
        setSelectedLevelFilePath(null);
      });
  }, [selectionId, fileBackedType]);

  useEffect(() => {
    void getGraphDataset()
      .then((result) => setGraphWarnings(result.validation.warnings))
      .catch(() => setGraphWarnings([]));
  }, []);

  if (rightCollapsed) {
    return (
      <aside className="grid h-full min-h-0 content-start justify-items-center overflow-y-auto overflow-x-visible border-l border-slate-800 bg-slate-950/85 p-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => setRightCollapsed(false)}
          title="Expand inspector (Ctrl/Cmd+I)"
        >
          Inspector
        </Button>
      </aside>
    );
  }

  if (!selection) {
    return (
      <aside className="h-full min-h-0 overflow-y-auto overflow-x-visible border-l border-slate-800 bg-slate-950/85 p-4">
        <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/90 p-3">
          <h3 className="m-0 text-base font-semibold">Inspector</h3>
          <p className="text-sm text-slate-400">
            Select a graph node or task row to inspect metadata and traceability.
          </p>
          {graphWarnings.length > 0 ? (
            <div className="mt-2 rounded-lg border border-amber-700/70 bg-amber-950/40 p-2 text-xs text-amber-200">
              <p className="m-0 font-medium">Graph Diagnostics ({graphWarnings.length})</p>
              {graphWarnings.slice(0, 4).map((issue, index) => (
                <p key={`${issue.ruleId}:${index}`} className="m-0">
                  [{issue.ruleId}] {issue.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full min-h-0 overflow-y-auto overflow-x-visible border-l border-slate-800 bg-slate-950/85 p-4">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {humanizeLabel(hasFileDocument ? "file" : selection.type)}
          </Badge>
          {typeof fileLaneValue === "string" ? (
            <Badge variant="secondary">{humanizeValue("lane", fileLaneValue)}</Badge>
          ) : null}
          {typeof fileStatusValue === "string" ? (
            <Badge variant="secondary">{humanizeValue("status", fileStatusValue)}</Badge>
          ) : null}
          {selectedLevelFile?.path ? (
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(selectedLevelFile.path);
              }}
              title="Copy this path, then use Ctrl+P in your editor and paste it."
            >
              Copy Path (Ctrl+P)
            </Button>
          ) : null}
          {selection.type === "task" && !hasFileDocument ? (
            <Button variant="ghost" type="button" onClick={() => setSelection(null)}>
              Close Task
            </Button>
          ) : null}
          {hasFileDocument ? (
            <Button
              variant="ghost"
              type="button"
              onClick={() => setShowEmptyFileMetadata((prev) => !prev)}
            >
              {showEmptyFileMetadata ? "Hide Empty Fields" : "Show Empty Fields"}
            </Button>
          ) : null}
        </div>

        <h3 className="m-0 text-base font-semibold">{selection.title}</h3>

        {graphWarnings.length > 0 ? (
          <Section title="Graph Diagnostics">
            {graphWarnings.slice(0, 8).map((issue, index) => (
              <Code key={`${issue.ruleId}:${index}`}>
                [{issue.ruleId}] {issue.message}
              </Code>
            ))}
          </Section>
        ) : null}

        {selection.id && !hasFileDocument ? (
          <p className="m-0 leading-tight">
            <span className="text-slate-400">ID</span>
            <br />
            <Code>{selection.id}</Code>
          </p>
        ) : null}

        <Separator />

        {selectedLevelFile ? (
          <>
            <div className="grid gap-3">
              {levelFiles.length > 1 ? (
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/40 p-2">
                  {levelFiles.map((file) => (
                    <Button
                      key={file.path}
                      variant={file.path === selectedLevelFilePath ? "secondary" : "ghost"}
                      type="button"
                      onClick={() => setSelectedLevelFilePath(file.path)}
                      title={file.path}
                    >
                      {file.path.split("/").pop()}
                    </Button>
                  ))}
                </div>
              ) : null}
              <Section title="Document">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(selectedLevelFile.path);
                    }}
                    title="Copy this path, then use Ctrl+P in your editor and paste it."
                  >
                    Copy Path (Ctrl+P)
                  </Button>
                </div>
                <Field label="Source" value={selectedLevelFile.path} />
              </Section>

              {selectedLevelFileFrontmatterEntries.length > 0 ? (
                <Section title="Metadata Summary">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {fileMetadataGroups.summary.map(([label, value]) => (
                      <MetadataValue key={`file-summary:${label}`} label={label} value={value} />
                    ))}
                  </div>
                </Section>
              ) : null}

              {selectedLevelFileFrontmatterEntries.length > 0 ? (
                <Section title="File Metadata">
                  {fileMetadataGroups.identity.length > 0 ? (
                    <MetadataDetails title="Identity">
                      {fileMetadataGroups.identity.map(([label, value]) => (
                        <MetadataValue key={`file-identity:${label}`} label={label} value={value} />
                      ))}
                    </MetadataDetails>
                  ) : null}

                  {fileMetadataGroups.workflow.length > 0 ? (
                    <MetadataDetails title="Workflow" defaultOpen>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
                        {fileMetadataGroups.workflow.map(([label, value]) => (
                          <div
                            key={`file-workflow:${label}`}
                            className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2"
                          >
                            <MetadataValue label={label} value={value} />
                          </div>
                        ))}
                      </div>
                    </MetadataDetails>
                  ) : null}

                  {fileMetadataGroups.references.length > 0 ? (
                    <MetadataDetails title="References">
                      {fileMetadataGroups.references.map(([label, value]) => (
                        <MetadataValue
                          key={`file-references:${label}`}
                          label={label}
                          value={value}
                        />
                      ))}
                    </MetadataDetails>
                  ) : null}

                  {fileMetadataGroups.criteria.length > 0 ? (
                    <MetadataDetails title="Completion Criteria">
                      {fileMetadataGroups.criteria.map(([label, value]) => (
                        <MetadataValue key={`file-criteria:${label}`} label={label} value={value} />
                      ))}
                    </MetadataDetails>
                  ) : null}
                </Section>
              ) : null}

              <Section title="Content">
                {selectedLevelFileExt === "md" ? (
                  <MarkdownViewer markdown={stripFrontmatter(selectedLevelFile.content)} />
                ) : (
                  <pre className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                    {selectedLevelFile.content}
                  </pre>
                )}
              </Section>
            </div>
          </>
        ) : selection.type === "task" ? (
          <>
            {rawTaskMetadata.length > 0 ? (
              <div className="grid gap-1.5">
                <p className="text-slate-400">Task Metadata</p>
                {rawTaskMetadata.map((item) => (
                  <Field
                    key={`${item.label}:${item.value}`}
                    label={item.label}
                    value={item.value}
                  />
                ))}
              </div>
            ) : null}

            {entityDetails ? (
              <>
                <Separator />
                <div className="grid gap-2">
                  <p className="text-slate-400">Related Data</p>
                  <RelatedList label="Tasks" values={entityDetails.relatedTasks} />
                  <RelatedList label="Milestones" values={entityDetails.relatedMilestones} />
                  <RelatedList label="Decisions" values={entityDetails.relatedDecisions} />
                  <RelatedList label="Modules" values={entityDetails.relatedModules} />
                </div>
              </>
            ) : null}

            <Separator />
            <div className="grid gap-1.5">
              <p className="text-slate-400">Task Trace</p>
              {trace?.decisionRefs?.map((decision) => (
                <Code key={decision}>{decision}</Code>
              ))}
              {trace?.moduleRefs?.map((moduleRef) => (
                <Code key={moduleRef}>{moduleRef}</Code>
              ))}
              {trace?.files?.map((file) => (
                <Code key={file}>{file}</Code>
              ))}
              {!trace?.decisionRefs?.length &&
              !trace?.moduleRefs?.length &&
              !trace?.files?.length ? (
                <p className="text-slate-400">No trace links found.</p>
              ) : null}
            </div>
            <p className="text-slate-400">Task document not available.</p>
          </>
        ) : (
          <>
            {filteredSelectionMetadata.map((item) => (
              <Field key={`${item.label}:${item.value}`} label={item.label} value={item.value} />
            ))}

            {entityDetails ? (
              <>
                <Separator />
                <div className="grid gap-2">
                  <p className="text-slate-400">Entity Data</p>
                  {entityDetails.summary.map((item) => (
                    <Field
                      key={`${item.label}:${item.value}`}
                      label={item.label}
                      value={item.value}
                    />
                  ))}
                  <RelatedList label="Tasks" values={entityDetails.relatedTasks} />
                  <RelatedList label="Milestones" values={entityDetails.relatedMilestones} />
                  <RelatedList label="Decisions" values={entityDetails.relatedDecisions} />
                  <RelatedList label="Modules" values={entityDetails.relatedModules} />
                </div>
              </>
            ) : null}

            {selection.links && selection.links.length > 0 ? (
              <>
                <Separator />
                <div>
                  <p className="text-slate-400">Trace Links</p>
                  <div className="grid gap-1.5">
                    {selection.links.map((link) => (
                      <Code key={link}>{link}</Code>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {selection.markdown ? (
              <>
                <Separator />
                <div className="grid gap-1.5">
                  <p className="text-slate-400">Node Notes</p>
                  <MarkdownViewer markdown={selection.markdown} />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
