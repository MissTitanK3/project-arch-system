import type {
  NormalizedTaskWorkflow,
  NormalizedTaskWorkflowBodySectionRef,
  NormalizedTaskWorkflowStageState,
  TaskType,
  TaskWorkflowItemStatus,
  TaskWorkflowRuntimePreference,
} from "../navigation/taskWorkflowParser";

// ─── Required context field snapshots ─────────────────────────────────────

/**
 * Snapshot of the task-level context required to seed a stage-chat session.
 * Bounded to identity, human-readable metadata, and task type.
 */
export interface StageChatTaskSnapshot {
  /** Canonical task identity. */
  id: string;
  title: string;
  status: string;
  taskType: TaskType;
}

/**
 * Snapshot of a single checklist item within the current stage.
 * Omits source provenance to keep the seed compact.
 */
export interface StageChatChecklistItemSnapshot {
  id: string;
  label: string;
  status: TaskWorkflowItemStatus;
  runtimePreference: TaskWorkflowRuntimePreference;
  notes: string | undefined;
  commandHint: string | undefined;
}

/**
 * Snapshot of the selected stage and its checklist, used to seed a
 * new stage-chat session.
 */
export interface StageChatStageSnapshot {
  /** Canonical stage identity. */
  id: string;
  title: string;
  description: string | undefined;
  runtimePreference: TaskWorkflowRuntimePreference;
  state: NormalizedTaskWorkflowStageState;
  items: StageChatChecklistItemSnapshot[];
}

// ─── Optional context fields ───────────────────────────────────────────────

/**
 * Resolved routing state for the stage at the time context is packaged.
 * Included when routing information is available so the model can orient
 * its assistance style to the expected runtime.
 */
export interface StageChatContextRoutingState {
  runtimePreference: TaskWorkflowRuntimePreference;
  /**
   * Resolved runtime class after routing policy is applied.
   * Undefined when routing has not yet been resolved.
   */
  resolvedRuntimeClass: "local" | "cloud" | undefined;
}

// ─── Stage-scoped context package ─────────────────────────────────────────

/**
 * Context package used to seed a stage-chat session.
 *
 * Required fields are always present. Optional fields are populated only
 * when relevant to the current stage and are empty or undefined otherwise.
 *
 * Stage-bounded context rules:
 * - Only the selected stage's data is included. All other stages are excluded.
 * - Body section reference is scoped to the selected stage's referenced
 *   section only. The full task body is not included by default.
 * - Evidence paths are aggregated from the selected stage's checklist items
 *   only, not from the full task.
 * - The workflow stages list is not forwarded to the chat session.
 */
export interface StageChatContextPackage {
  // ---- Required ----

  /** Snapshot of task identity and metadata. Always present. */
  task: StageChatTaskSnapshot;
  /** Snapshot of the selected stage and its checklist items. Always present. */
  stage: StageChatStageSnapshot;

  // ---- Optional: populated when relevant, empty or undefined otherwise ----

  /**
   * Reference to the task-body section that maps to this stage.
   * Included when the stage has a body section so only the relevant
   * task-body section is made available rather than the full task body.
   * Undefined when no body section is associated with this stage.
   */
  bodySectionRef: NormalizedTaskWorkflowBodySectionRef | undefined;

  /**
   * Code targets from the task frontmatter that are relevant to the current
   * stage. Passed through from task frontmatter when provided. Empty array
   * when not available.
   */
  codeTargets: string[];

  /**
   * Evidence paths aggregated from the current stage's checklist items.
   * These are stage-scoped: only paths from items in this stage are included.
   * Empty array when no items have evidence paths.
   */
  evidencePaths: string[];

  /**
   * Upstream task IDs this task depends on (from task frontmatter).
   * Included to let the model understand upstream context when relevant.
   * Empty array when not available.
   */
  dependsOnTaskIds: string[];

  /**
   * Downstream task IDs blocked by this task (from task frontmatter).
   * Included to help identify follow-up work during stage chat.
   * Empty array when not available.
   */
  blocksTaskIds: string[];

  /**
   * Current runtime routing state for the stage.
   * Included when routing has been resolved so the model can orient to the
   * expected runtime. Undefined when routing state is not yet available.
   */
  routingState: StageChatContextRoutingState | undefined;
}

// ─── Context package builder ───────────────────────────────────────────────

/**
 * Input for building a stage-scoped context package.
 *
 * The workflow and stageId are required. All other fields are optional
 * task-frontmatter or routing values that supplement the workflow data.
 */
export interface StageChatContextPackageInput {
  /** Normalized task workflow containing task and stage data. */
  workflow: NormalizedTaskWorkflow;
  /** The stage ID to scope this context package to. */
  stageId: string;
  /**
   * Task-level code targets from the task frontmatter.
   * Optional. Omitted from the package when not provided.
   */
  codeTargets?: string[];
  /**
   * Upstream task IDs from the task frontmatter dependsOn list.
   * Optional. Omitted from the package when not provided.
   */
  dependsOnTaskIds?: string[];
  /**
   * Downstream task IDs from the task frontmatter blocks list.
   * Optional. Omitted from the package when not provided.
   */
  blocksTaskIds?: string[];
  /**
   * Resolved routing state for this stage at the time of packaging.
   * Optional. Omitted from the package when not available.
   */
  routingState?: StageChatContextRoutingState;
}

export type StageChatContextBuildError = "empty-task-id" | "empty-stage-id" | "stage-not-found";

export type StageChatContextBuildResult =
  | { ok: true; package: StageChatContextPackage }
  | { ok: false; error: StageChatContextBuildError };

/**
 * Build a stage-scoped context package from the given workflow and stage ID.
 *
 * Stage-bounded context rules enforced by this function:
 * - Only the stage matching `stageId` is included; all other stages are
 *   excluded from the package.
 * - `bodySectionRef` is taken from that stage's own `bodySection` field only.
 * - `evidencePaths` are aggregated only from the selected stage's items.
 * - The full workflow stages array is never forwarded.
 *
 * Returns an error discriminant when the task ID or stage ID is empty, or
 * when the stage cannot be found in the workflow.
 */
export function buildStageChatContextPackage(
  input: StageChatContextPackageInput,
): StageChatContextBuildResult {
  const { workflow, stageId } = input;

  if (!workflow.task.id || !workflow.task.id.trim()) {
    return { ok: false, error: "empty-task-id" };
  }

  if (!stageId || !stageId.trim()) {
    return { ok: false, error: "empty-stage-id" };
  }

  const stage = workflow.workflow.stages.find((s) => s.id === stageId);
  if (!stage) {
    return { ok: false, error: "stage-not-found" };
  }

  // Stage-bounded rule: aggregate evidence paths from this stage's items only.
  const evidencePaths = Array.from(new Set(stage.items.flatMap((item) => item.evidencePaths)));

  const itemSnapshots: StageChatChecklistItemSnapshot[] = stage.items.map((item) => ({
    id: item.id,
    label: item.label,
    status: item.status,
    runtimePreference: item.runtimePreference,
    notes: item.notes,
    commandHint: item.commandHint,
  }));

  const stageSnapshot: StageChatStageSnapshot = {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    runtimePreference: stage.runtimePreference,
    state: stage.state,
    items: itemSnapshots,
  };

  const taskSnapshot: StageChatTaskSnapshot = {
    id: workflow.task.id,
    title: workflow.task.title,
    status: workflow.task.status,
    taskType: workflow.task.taskType,
  };

  const pkg: StageChatContextPackage = {
    task: taskSnapshot,
    stage: stageSnapshot,
    bodySectionRef: stage.bodySection,
    codeTargets: input.codeTargets ?? [],
    evidencePaths,
    dependsOnTaskIds: input.dependsOnTaskIds ?? [],
    blocksTaskIds: input.blocksTaskIds ?? [],
    routingState: input.routingState,
  };

  return { ok: true, package: pkg };
}

// ─── Session seeding contract ──────────────────────────────────────────────

/**
 * The structured payload used to seed a new stage-chat session.
 *
 * The seed message is derived from a `StageChatContextPackage` and forms
 * the first context message in a new stage-chat session.
 *
 * Seeding contract rules:
 * - The seed message is deterministic given the same context package.
 * - It includes only stage-scoped context (stage-bounded rule).
 * - Optional fields are omitted from the seed text when empty or undefined.
 * - The seed message does not include prior chat history, rolling summaries,
 *   or runtime handoff state. Those are handled in later milestones.
 * - The `threadContext` field provides the stable task-stage identity that
 *   links this seed to its logical thread, regardless of backing session.
 */
export interface StageChatSeedMessage {
  /**
   * Stable logical thread identity derived from the context package.
   * This links the seed to its stage and task without depending on any
   * backing session identifier.
   */
  threadContext: {
    taskId: string;
    stageId: string;
  };
  /**
   * Structured seed text for the first message in the session.
   * Formatted as compact markdown so the model can orient to the stage.
   * Optional sections are omitted when their source fields are empty.
   */
  seedText: string;
  /**
   * The context package this seed was derived from.
   * Retained so the session substrate can re-seed, debug seeding, or
   * produce alternative seed formats from the same package.
   */
  contextPackage: StageChatContextPackage;
}

/**
 * Build a seed message from a stage-chat context package.
 *
 * The resulting `seedText` is compact markdown. Only sections with content
 * are emitted; empty optional sections are omitted entirely rather than
 * rendered as empty placeholders.
 *
 * This function is deterministic: the same package always produces the same
 * seed message.
 */
export function buildStageChatSeedMessage(pkg: StageChatContextPackage): StageChatSeedMessage {
  const lines: string[] = [];

  // ── Task ──────────────────────────────────────────────────────────────────
  lines.push(`## Task`);
  lines.push(`- ID: ${pkg.task.id}`);
  lines.push(`- Title: ${pkg.task.title}`);
  lines.push(`- Status: ${pkg.task.status}`);
  lines.push(`- Type: ${pkg.task.taskType}`);

  // ── Stage ─────────────────────────────────────────────────────────────────
  lines.push(``);
  lines.push(`## Stage`);
  lines.push(`- ID: ${pkg.stage.id}`);
  lines.push(`- Title: ${pkg.stage.title}`);
  if (pkg.stage.description) {
    lines.push(`- Description: ${pkg.stage.description}`);
  }
  lines.push(`- State: ${pkg.stage.state}`);
  lines.push(`- Runtime preference: ${pkg.stage.runtimePreference}`);

  // ── Checklist ─────────────────────────────────────────────────────────────
  if (pkg.stage.items.length > 0) {
    lines.push(``);
    lines.push(`## Checklist`);
    for (const item of pkg.stage.items) {
      const mark = item.status === "done" ? "[x]" : "[ ]";
      lines.push(`- ${mark} ${item.label} (${item.status})`);
      if (item.notes) {
        lines.push(`  - Notes: ${item.notes}`);
      }
    }
  }

  // ── Code targets (optional) ───────────────────────────────────────────────
  if (pkg.codeTargets.length > 0) {
    lines.push(``);
    lines.push(`## Code Targets`);
    for (const target of pkg.codeTargets) {
      lines.push(`- ${target}`);
    }
  }

  // ── Evidence (optional) ───────────────────────────────────────────────────
  if (pkg.evidencePaths.length > 0) {
    lines.push(``);
    lines.push(`## Evidence`);
    for (const ep of pkg.evidencePaths) {
      lines.push(`- ${ep}`);
    }
  }

  // ── Dependencies (optional) ───────────────────────────────────────────────
  if (pkg.dependsOnTaskIds.length > 0) {
    lines.push(``);
    lines.push(`## Depends On`);
    for (const dep of pkg.dependsOnTaskIds) {
      lines.push(`- ${dep}`);
    }
  }

  // ── Blocks (optional) ─────────────────────────────────────────────────────
  if (pkg.blocksTaskIds.length > 0) {
    lines.push(``);
    lines.push(`## Blocks`);
    for (const blocked of pkg.blocksTaskIds) {
      lines.push(`- ${blocked}`);
    }
  }

  // ── Routing state (optional) ──────────────────────────────────────────────
  if (pkg.routingState) {
    lines.push(``);
    lines.push(`## Routing`);
    lines.push(`- Preference: ${pkg.routingState.runtimePreference}`);
    if (pkg.routingState.resolvedRuntimeClass) {
      lines.push(`- Resolved class: ${pkg.routingState.resolvedRuntimeClass}`);
    }
  }

  return {
    threadContext: {
      taskId: pkg.task.id,
      stageId: pkg.stage.id,
    },
    seedText: lines.join("\n"),
    contextPackage: pkg,
  };
}
