export interface PlannedBootstrapTask {
  id: string;
  slug: string;
  title: string;
  taskType?: string;
  agentExecutable?: boolean;
  tags: string[];
  dependsOn?: string[];
  codeTargets?: string[];
  publicDocs?: string[];
  traceLinks?: string[];
  completionCriteria: string[];
  objective: string;
  questions: string[];
  implementationPlan: string[];
  verification: string[];
}

export interface GeneratedWorkflowDefinition {
  slug: "before-coding" | "after-coding" | "complete-task" | "new-module" | "diagnose";
  title: string;
  purpose: string;
  whenToUse: string[];
  commandSequence: string[];
  validationOrFollowUp: string[];
  adaptationNote: string;
}

export function renderOrderedSteps(items: string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

export function renderBulletSteps(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}

export function renderGeneratedWorkflowFile(definition: GeneratedWorkflowDefinition): string {
  const whenToUseLines = renderBulletSteps(definition.whenToUse);
  const commandLines = renderOrderedSteps(definition.commandSequence);
  const validationLines = renderBulletSteps(definition.validationOrFollowUp);

  return [
    `# ${definition.title}`,
    "",
    "This file is a generated workflow helper on the project-arch-owned workflow-document surface (`.project-arch/workflows/*.workflow.md`). It is subordinate to the canonical repository instruction surfaces.",
    "",
    "## Purpose",
    "",
    definition.purpose,
    "",
    "## When To Use",
    "",
    ...whenToUseLines,
    "",
    "## Required Context",
    "",
    "- resolve active repository context through `pa context --json` when that surface is available",
    "- treat active phase, milestone, task, and target surfaces as structured inputs rather than unresolved placeholders",
    "- confirm the relevant architecture and roadmap surfaces before applying workflow guidance",
    "- if structured context is unavailable, stop and resolve context manually rather than guessing from placeholders",
    "",
    "## Canonical Command Sequence",
    "",
    ...commandLines,
    "",
    "## Validation Or Follow-Up Expectations",
    "",
    ...validationLines,
    "",
    "## Fail-Safe Behavior",
    "",
    "- if required context is missing, stop and resolve the missing context before continuing",
    "- if the workflow target surface is unsupported, do not invent an alternate path silently",
    "- if this workflow appears to conflict with canonical repository governance, follow the canonical governance documents instead",
    "- do not invent alternate workflow locations or duplicate copies of this workflow on other surfaces",
    "",
    "## Authority Reminder",
    "",
    "- generated workflow files are helper artifacts, not primary instruction surfaces",
    "- generated workflow files live on the canonical project-arch-owned workflow-document surface: `.project-arch/workflows/*.workflow.md`",
    "- canonical agent entry-point guidance wins over this file when instructions conflict",
    "- use `AGENTS.md` when present; during transitional scaffolds, consult `agents.md` as the current root entry surface",
    "- repository-wide architecture and policy guidance still lives in `architecture/` and `roadmap/`",
    "",
    "## Adaptation Note",
    "",
    definition.adaptationNote,
    "",
    "## Related Governance",
    "",
    "- `architecture/governance/workflow-content-model.md`",
    "- `architecture/governance/workflow-file-inventory.md`",
    "- `architecture/governance/workflow-generation-behavior.md`",
    "",
  ].join("\n");
}

export function renderTaskBody(task: PlannedBootstrapTask): string {
  const questionList = renderBulletSteps(task.questions);
  const implementationSteps = renderOrderedSteps(task.implementationPlan);
  const verificationSteps = renderOrderedSteps(task.verification);

  return [
    "## Objective",
    "",
    task.objective,
    "",
    "## Required Input",
    "",
    "- Use `architecture/product-framing/prompt.md` as the canonical setup prompt source.",
    "- Derive this task's outputs from the prompt rather than writing disconnected assumptions.",
    "",
    "## Questions To Answer",
    "",
    ...questionList,
    "",
    "## Implementation Plan",
    "",
    ...implementationSteps,
    "",
    "## Verification",
    "",
    ...verificationSteps,
    "",
  ].join("\n");
}
