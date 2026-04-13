import path from "path";
import fs from "fs-extra";
import { ensureDir, pathExists, writeJsonDeterministic } from "../../utils/fs";
import {
  projectDir,
  projectDocsRoot,
  projectManifestPath,
  projectMilestoneDecisionsRoot,
  projectMilestoneDir,
  projectMilestoneTaskLaneDir,
  projectMilestoneTargetsPath,
  projectOverviewPath,
  projectPhaseDecisionsRoot,
  projectPhaseDir,
  projectPhasesRoot,
} from "../../utils/paths";
import { currentDateISO } from "../../utils/date";
import {
  defaultProjectManifest,
  ensureDecisionIndex,
  rebuildArchitectureGraph,
} from "../../core/manifests";
import { defaultPolicyFileDocument } from "../../core/governance/policy";
import { ObservationStore } from "../../feedback/observation-store.js";
import { IssueStore } from "../../feedback/issue-store.js";
import { defaultTaskFrontmatter } from "../../core/templates/task";
import { defaultArchitectureSpecTemplate } from "../../core/templates/architecture";
import { defaultConceptMapTemplate } from "../../core/templates/conceptMap";
import { defaultMilestoneGapClosureReportTemplate } from "../../core/templates/milestoneGapClosure";
import { defaultValidationContractTemplate } from "../../core/templates/validationContract";
import { agentSkillSchema } from "../../schemas/agentSkill";
import { DEFAULT_PHASE_PROJECT_ID } from "../../schemas/phase";
import { syncRegistry } from "../agents/syncRegistry";
import {
  defaultAgentsReadme,
  defaultUserSkillTemplateChecklist,
  defaultUserSkillTemplateReadme,
  defaultUserSkillTemplateSystem,
  foundationalAgentSkills,
} from "../templates/agents";
import {
  renderGeneratedWorkflowFile,
  renderTaskBody,
  type GeneratedWorkflowDefinition,
  type PlannedBootstrapTask,
} from "./generatedContent";
import { generateArchitectureFamilyReadme, generateStandardsContent } from "./documentBuilders";
import { scaffoldAgentsGuide, scaffoldGovernanceGuidanceDocs } from "./governanceGuidanceScaffold";
import {
  flushManagedWriteLogs,
  type ManagedWriteState,
  writeManagedFile,
  writeManagedJsonFile,
  writeManagedMarkdownFile,
  writeMarkdownFile,
  writeTextFileIfMissing,
} from "./initWrites";

export interface InitOptions {
  template?: string;
  pm?: string;
  withAi?: boolean;
  withWorkflows?: boolean;
  force?: boolean;
}

function milestoneTargetsTemplate(): string {
  return [
    "# Implementation Targets",
    "",
    "This document defines where implementation for this milestone must occur.",
    "",
    "Agents must consult this file before writing code.",
    "",
    "---",
    "",
    "## Architecture Surfaces",
    "",
    "The bootstrap milestone is documentation-first. Seed work should be implemented in:",
    "",
    "- `architecture/product-framing`",
    "- `architecture/systems`",
    "- `architecture/governance`",
    "- `architecture/runtime`",
    "",
    "---",
    "",
    "## Purpose Of This Milestone",
    "",
    "This milestone exists to make the architecture scaffold actionable before product-specific runtime modules are implemented.",
    "",
    "---",
    "",
    "## Placement Rules",
    "",
    "1. Product framing updates: `architecture/product-framing`",
    "2. System boundary definitions: `architecture/systems`",
    "3. Governance and module model updates: `architecture/governance`",
    "4. Runtime architecture documentation: `architecture/runtime`",
    "5. Seed milestone work should not claim undeclared runtime packages that do not exist yet",
    "",
    "---",
    "",
    "## Forbidden Placement",
    "",
    "Agents must not:",
    "",
    "- treat undeclared package targets as if they already exist in a fresh scaffold",
    "- create legacy top-level application roots outside `packages/` without an approved migration decision",
    "",
    "---",
    "",
    "## Example Task Mapping",
    "",
    "Example task:",
    "",
    "- `008-finalize-architecture-foundation.md`",
    "",
    "Expected changes:",
    "",
    "- `architecture/product-framing/*`",
    "- `architecture/systems/*`",
    "- `architecture/governance/*`",
    "- `architecture/runtime/*`",
  ].join("\n");
}

const generatedWorkflowDefinitions: GeneratedWorkflowDefinition[] = [
  {
    slug: "before-coding",
    title: "Before Coding Workflow",
    purpose: "Prepare implementation for a scoped task before making repository changes.",
    whenToUse: [
      "before starting implementation on an active roadmap task",
      "when you need to confirm the current task, targets, and relevant architecture surfaces",
    ],
    commandSequence: [
      "Resolve current structured context through `pa context --json` once that surface is available.",
      "Review the active task, milestone targets, and relevant architecture surfaces before editing files.",
      "Use `pa next --json` only as a recommendation aid when you need help confirming the next governed action.",
      "Run `pa check` first if the repository may already be in a drifted or partially broken state.",
    ],
    validationOrFollowUp: [
      "Do not start coding until the active task, target surfaces, and governing documents are clear.",
      "If required context cannot be resolved, surface the missing context instead of starting from placeholders.",
    ],
    adaptationNote:
      "This workflow is for pre-implementation preparation on the `.project-arch/workflows/*.workflow.md` document surface; it does not replace canonical repo-wide instructions.",
  },
  {
    slug: "after-coding",
    title: "After Coding Workflow",
    purpose: "Close the implementation loop after code changes but before declaring work complete.",
    whenToUse: [
      "after implementation is finished and you need to validate the repository state",
      "before handing work off for review or moving to the next task",
    ],
    commandSequence: [
      "Run `pa check` to validate the repository after implementation.",
      "Run task-specific verification commands required by the active task or affected surfaces.",
      "Review changed files against the active task and milestone targets before handoff.",
    ],
    validationOrFollowUp: [
      "Capture the actual verification results rather than reporting that validation was run without evidence.",
      "If validation fails, return to diagnosis or repair work instead of proceeding to task completion.",
    ],
    adaptationNote:
      "This workflow keeps the post-edit loop explicit on the project-arch-owned `.project-arch/workflows/*.workflow.md` surface without inventing tool-local validation rules.",
  },
  {
    slug: "complete-task",
    title: "Complete Task Workflow",
    purpose: "Record completion evidence, validation, and traceability for an active task.",
    whenToUse: [
      "when a planned or discovered task is ready to be marked complete",
      "when you need to capture progress, evidence, and remaining follow-up work",
    ],
    commandSequence: [
      "Run `pa check` as the minimum repository validation step before closing the task.",
      "Update the active task file with progress, implementation notes, and verification results.",
      "Record any remaining follow-up work in the appropriate planned, discovered, or backlog lane.",
    ],
    validationOrFollowUp: [
      "Do not mark a task complete without traceable evidence of what changed and how it was verified.",
      "If the task exposes new gaps, create the governed follow-up artifact instead of burying the issue in prose.",
    ],
    adaptationNote:
      "This workflow keeps task closeout tied to roadmap traceability on the project-arch-owned `.project-arch/workflows/*.workflow.md` surface rather than treating completion as a purely conversational step.",
  },
  {
    slug: "new-module",
    title: "New Module Workflow",
    purpose:
      "Guide structural additions such as new modules, packages, or app areas through repository governance.",
    whenToUse: [
      "before adding a new package, app, or shared module surface",
      "when ownership, dependency, or placement rules must be checked before creation",
    ],
    commandSequence: [
      "Confirm the new surface is justified by the active task, milestone targets, and architecture governance documents.",
      "Update architecture and arch-model artifacts that describe the new module boundary.",
      "Run `pa check` after creating the structure and its supporting governance updates.",
    ],
    validationOrFollowUp: [
      "Do not add new structural surfaces without documenting ownership and dependency rules.",
      "If the new module requires a decision record, capture that decision before broad implementation continues.",
    ],
    adaptationNote:
      "This workflow keeps structural expansion on the project-arch-owned `.project-arch/workflows/*.workflow.md` surface governed by repository placement and ownership rules rather than by ad hoc file creation.",
  },
  {
    slug: "diagnose",
    title: "Diagnose Workflow",
    purpose:
      "Provide a repeatable debugging and drift-analysis workflow for architecture or repository health issues.",
    whenToUse: [
      "when validation fails or architecture drift is suspected",
      "when you need to inspect structural issues before choosing a repair path",
    ],
    commandSequence: [
      "Run `pa check` to surface structural and traceability issues.",
      "Use `pa next --json` if a deterministic next action would help narrow the repair path.",
      "Inspect the affected task, milestone, architecture, or module surfaces before choosing remediation.",
    ],
    validationOrFollowUp: [
      "Summarize the diagnosed issue in terms of repository governance, not only local symptoms.",
      "Choose the next governed repair path only after the failure mode is explicit.",
    ],
    adaptationNote:
      "This workflow is a debugging helper on the project-arch-owned `.project-arch/workflows/*.workflow.md` surface; it must not become an alternate decision system.",
  },
];

const bootstrapTasks: PlannedBootstrapTask[] = [
  {
    id: "001",
    slug: "define-project-overview",
    title: "Define project overview in architecture",
    taskType: "spec",
    tags: ["setup", "architecture", "overview"],
    publicDocs: [
      "architecture/product-framing/prompt.md",
      "architecture/product-framing/project-overview.md",
    ],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "architecture/product-framing/prompt.md is populated with project-specific setup prompt content.",
      "architecture/product-framing/project-overview.md is completed with concrete, non-placeholder content.",
      "Project overview clearly describes problem, users, and value proposition.",
      "pa check passes after overview documentation updates.",
    ],
    objective:
      "Capture a clear project overview so agents and developers can align on what is being built and why.",
    questions: [
      "What specific problem does this project solve?",
      "Who are the primary users and stakeholders?",
      "What pain points exist in the current alternative?",
      "What does success look like for users in one sentence?",
      "Why should this project exist now?",
    ],
    implementationPlan: [
      "Paste the project setup prompt into architecture/product-framing/prompt.md.",
      "Fill out architecture/product-framing/project-overview.md with specific project context.",
      "Describe intended users and core user outcomes.",
      "Replace all placeholder content in overview sections with real answers derived from prompt.md.",
    ],
    verification: [
      "Confirm architecture/product-framing/prompt.md does not include the PASTE_FOUNDATIONAL_PROMPT_HERE placeholder.",
      "Review architecture/product-framing/project-overview.md and confirm no '...' placeholders remain.",
      "Confirm the project problem and user definition are explicit and testable.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "002",
    slug: "define-project-goals",
    title: "Define project goals in architecture",
    taskType: "spec",
    agentExecutable: true,
    tags: ["setup", "architecture", "goals"],
    publicDocs: ["architecture/product-framing/goals.md"],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "architecture/product-framing/goals.md includes measurable primary and secondary goals.",
      "Goals include acceptance signals that can be verified during delivery.",
      "pa check passes after goals documentation updates.",
    ],
    objective:
      "Define measurable goals so implementation decisions can be evaluated against clear outcomes.",
    questions: [
      "What are the top three outcomes this project must achieve?",
      "How will each primary goal be measured?",
      "Which goals are required for launch versus later iterations?",
      "What tradeoffs are acceptable to achieve these goals?",
      "What would cause this effort to be considered unsuccessful?",
    ],
    implementationPlan: [
      "Extract goal statements from architecture/product-framing/prompt.md and convert them into concrete measurable statements in architecture/product-framing/goals.md.",
      "Separate launch-critical goals from secondary improvements.",
      "Document metrics or qualitative signals for each goal.",
    ],
    verification: [
      "Confirm each primary goal has a measurable validation signal.",
      "Confirm goals do not conflict with the project overview.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "003",
    slug: "map-user-journey",
    title: "Map user journey in architecture",
    taskType: "spec",
    agentExecutable: true,
    tags: ["setup", "architecture", "user-journey"],
    publicDocs: ["architecture/product-framing/user-journey.md"],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "architecture/product-framing/user-journey.md captures end-to-end user flow steps.",
      "Journey includes user entry point, core actions, and desired outcomes.",
      "pa check passes after user journey documentation updates.",
    ],
    objective:
      "Document the user journey so architecture and implementation choices map to real user flow.",
    questions: [
      "How does a user discover and start using the product?",
      "What are the key user actions from start to success?",
      "Where are the highest-friction steps in the journey?",
      "What states or transitions must be preserved (session, progress, permissions)?",
      "Which edge cases must the journey explicitly support?",
    ],
    implementationPlan: [
      "Extract user flow from architecture/product-framing/prompt.md and fill architecture/product-framing/user-journey.md with concrete journey steps.",
      "Include happy-path and critical edge-path scenarios.",
      "Map each step to expected system behavior or constraints.",
    ],
    verification: [
      "Confirm journey steps can be traced from entry to completion.",
      "Confirm at least one critical edge case is documented.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "004",
    slug: "define-scope-and-non-scope",
    title: "Define scope and non-scope in architecture",
    taskType: "spec",
    agentExecutable: true,
    tags: ["setup", "architecture", "scope"],
    publicDocs: ["architecture/product-framing/scope.md"],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "architecture/product-framing/scope.md clearly defines in-scope and out-of-scope work.",
      "Non-scope boundaries reduce ambiguity for implementation planning.",
      "pa check passes after scope documentation updates.",
    ],
    objective:
      "Set clear boundaries on what this project will and will not deliver in the current phase.",
    questions: [
      "What capabilities are explicitly in scope for the first release?",
      "What ideas are valuable but intentionally out of scope?",
      "What constraints (time, team, budget, compliance) shape scope decisions?",
      "Which assumptions are we making that need validation later?",
      "What decisions could trigger a scope change?",
    ],
    implementationPlan: [
      "Derive explicit in-scope and out-of-scope boundaries from architecture/product-framing/prompt.md and complete architecture/product-framing/scope.md.",
      "List in-scope items that are required for milestone success.",
      "List out-of-scope items to prevent accidental expansion.",
    ],
    verification: [
      "Confirm scope section is specific and implementation-actionable.",
      "Confirm non-scope section includes at least three explicit exclusions.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "005",
    slug: "define-system-boundaries",
    title: "Define system boundaries in architecture",
    taskType: "spec",
    agentExecutable: true,
    tags: ["setup", "architecture", "system-boundaries", "discover", "greenfield"],
    publicDocs: ["architecture/systems/system-boundaries.md"],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "architecture/systems/system-boundaries.md contains explicit domain ownership sections.",
      "Each domain boundary maps to at least one runtime or shared package module.",
      "Interaction constraints between domains are stated.",
      "If the project already has a codebase: boundaries are derived from observed module structure.",
      "If the project is greenfield: boundaries are derived from architecture/product-framing docs.",
      "pa check passes after file is populated.",
    ],
    objective:
      "Establish canonical system boundary definitions so agents and contributors know which domain owns which module and what cross-domain interaction is explicitly permitted or forbidden.",
    questions: [
      "Does an existing application codebase already define implicit module or package boundaries?",
      "What are the top-level problem-space domains for this product?",
      "Which package directories map to each domain?",
      "What cross-domain interactions must be explicitly constrained?",
      "Are any domain boundaries ambiguous or overlapping?",
    ],
    implementationPlan: [
      "**Discover mode (existing codebase):**",
      "Inspect packages/ and arch-model files to identify existing module responsibilities.",
      "Group modules into problem-space domains derived from the current codebase and ownership hints.",
      "Write domain ownership and interaction rules in architecture/systems/system-boundaries.md.",
      "**Define mode (greenfield):**",
      "Read architecture/product-framing/prompt.md, project-overview.md, goals.md, and scope.md.",
      "Derive intended domains and map each to planned package modules.",
      "Draft boundary ownership and constraints with explicit TBD markers for unknowns.",
      "Architecture Decisions: Use architecture/decisions/ (not roadmap/decisions/) for architecture-scope decision records created during this task.",
    ],
    verification: [
      "Confirm system-boundaries.md names at least two distinct domain sections.",
      "Confirm each domain section lists at least one owned module.",
      "Confirm at least one interaction constraint or boundary rule is stated.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "006",
    slug: "define-module-model",
    title: "Define module model in architecture",
    taskType: "spec",
    agentExecutable: true,
    tags: ["setup", "architecture", "module-model", "discover", "greenfield"],
    publicDocs: ["architecture/governance/module-model.md"],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "architecture/governance/module-model.md describes each module responsibility and composition role.",
      "All modules listed in arch-model/modules.json appear in the document.",
      "Composition rules and dependency direction are stated.",
      "If codebase exists: module descriptions come from observed implementation.",
      "If greenfield: module descriptions are derived from product-framing and arch-domains.",
      "pa check passes after file is populated.",
    ],
    objective:
      "Create a human-readable module model that complements arch-model/modules.json so agents understand what each module owns and where new code belongs.",
    questions: [
      "What does each packages/ module currently do or intend to do?",
      "Which modules are consumed by multiple apps versus used by only one?",
      "What dependency rules exist between modules?",
      "Are any modules planned but not yet scaffolded?",
      "Are there modules in the codebase not yet listed in arch-model/modules.json?",
    ],
    implementationPlan: [
      "**Discover mode (existing codebase):**",
      "Read arch-model/modules.json, ownership.json, and dependencies.json as starting points.",
      "Inspect each module public surface (for example src/index.ts) to confirm actual responsibility.",
      "Draft architecture/governance/module-model.md with one section per module describing purpose and dependency rules.",
      "Reconcile gaps between arch-model data and observed module behavior.",
      "**Define mode (greenfield):**",
      "Read architecture/product-framing docs and derive intended module responsibilities.",
      "Use arch-model/modules.json as the initial module inventory.",
      "Draft module sections with intended public surface and allowed dependencies, marking unknowns as TBD with reason.",
      "Align module responsibilities with domain ownership in arch-domains/domains.json.",
    ],
    verification: [
      "Confirm every module in arch-model/modules.json has a section in module-model.md.",
      "Confirm each module section states the primary responsibility.",
      "Confirm dependency rules are stated for each module set.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "007",
    slug: "define-runtime-architecture",
    title: "Define runtime architecture in architecture",
    taskType: "spec",
    agentExecutable: true,
    tags: ["setup", "architecture", "runtime-architecture", "discover", "greenfield"],
    publicDocs: ["architecture/runtime/runtime-architecture.md"],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "architecture/runtime/runtime-architecture.md documents critical runtime paths.",
      "Deployment topology or runtime environment constraints are documented.",
      "At least one critical user-facing path is described end to end.",
      "If codebase exists: runtime paths are validated against observed routing and API structure.",
      "If greenfield: runtime architecture is derived from product-framing user journey and scope docs.",
      "pa check passes after file is populated.",
    ],
    objective:
      "Establish the canonical runtime architecture description so agents know deployment model, critical execution paths, and runtime constraints before implementation.",
    questions: [
      "What is the deployment model for each app (for example serverless, containerized, static export)?",
      "What are the critical paths that must work for the product to function?",
      "Where do authentication, session, and data-fetching boundaries fall at runtime?",
      "Are there asynchronous or background processing flows that must be documented?",
      "What performance or latency constraints must architecture respect?",
    ],
    implementationPlan: [
      "**Discover mode (existing codebase):**",
      "Inspect app routing and data-fetching patterns in runtime surfaces.",
      "Audit API boundaries and identify where runtime concerns cross module boundaries.",
      "Map observed authentication, session, and request/response critical paths.",
      "Draft architecture/runtime/runtime-architecture.md with topology, critical paths, and constraints from observed behavior.",
      "**Define mode (greenfield):**",
      "Read architecture/product-framing/user-journey.md and scope.md to derive required runtime flows.",
      "Draft expected deployment topology for each planned app surface.",
      "Describe anticipated critical paths from user entry to successful outcome.",
      "Record unresolved runtime choices as open questions or decision candidates.",
    ],
    verification: [
      "Confirm runtime-architecture.md names the deployment model for planned app surfaces.",
      "Confirm at least one critical path is described with entry, processing steps, and response.",
      "Confirm unresolved runtime decisions are logged as open questions or decision candidates.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "008",
    slug: "finalize-architecture-foundation",
    title: "Finalize architecture foundation readiness",
    taskType: "spec",
    tags: ["setup", "architecture"],
    dependsOn: ["001", "002", "003", "004", "005", "006", "007"],
    traceLinks: [
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ],
    completionCriteria: [
      "All architecture/product-framing documents are completed with project-specific content.",
      "Tasks 005, 006, and 007 are completed before this task is marked done.",
      "The canonical seed docs in `architecture/systems/`, `architecture/governance/`, and `architecture/runtime/` have non-placeholder content.",
      "architecture documents are internally consistent across overview, goals, journey, and scope.",
      "Architecture family docs, standards, reference, and arch-domains include initial context for upcoming milestones.",
      "pa check passes after docs foundation setup.",
    ],
    objective:
      "Finalize architecture as the agent-ready project source of truth before feature implementation starts.",
    questions: [
      "Do the overview, goals, journey, and scope documents align without contradictions?",
      "What foundational architecture decisions must be captured next?",
      "What unknowns remain and where should they be tracked?",
      "Which documents should be updated first when requirements change?",
      "Is there enough information for a new contributor or agent to begin implementation confidently?",
    ],
    implementationPlan: [
      "Review architecture/product-framing/prompt.md and all derived product-framing files for completeness and consistency.",
      "Review architecture/systems/system-boundaries.md, architecture/governance/module-model.md, and architecture/runtime/runtime-architecture.md after they are completed.",
      "Add initial context files in architecture/systems, architecture/governance, architecture/runtime, standards, and reference where needed.",
      "Define initial domain boundaries in arch-domains with ownership and feature mapping.",
      "Resolve conflicts or ambiguities between foundational documents.",
      "Link future milestones to architecture as the required reference source.",
    ],
    verification: [
      "Confirm architecture/product-framing has no placeholder lines left for required sections.",
      "Confirm architecture/systems, architecture/governance, architecture/runtime, standards, reference, and arch-domains each include initial documentation.",
      "Confirm systems/system-boundaries.md, governance/module-model.md, and runtime/runtime-architecture.md are non-placeholder and aligned with product-framing docs.",
      "Confirm a new contributor can answer core project questions using architecture only.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
];

async function ensureDirIfMissing(cwd: string, relativeDir: string): Promise<void> {
  const target = path.join(cwd, relativeDir);
  if (!(await pathExists(target))) {
    await ensureDir(target);
  }
}

async function scaffoldAgentsOfArch(cwd: string): Promise<void> {
  const agentsRoot = path.join(cwd, ".arch", "agents-of-arch");
  const skillsRoot = path.join(agentsRoot, "skills");
  const userSkillsRoot = path.join(agentsRoot, "user-skills");
  const userTemplateRoot = path.join(userSkillsRoot, "_template");

  await ensureDir(skillsRoot);
  await ensureDir(userSkillsRoot);
  await ensureDir(userTemplateRoot);

  await writeTextFileIfMissing(path.join(agentsRoot, "README.md"), defaultAgentsReadme());
  await writeTextFileIfMissing(
    path.join(userTemplateRoot, "README.md"),
    defaultUserSkillTemplateReadme(),
  );
  await writeTextFileIfMissing(
    path.join(userTemplateRoot, "system.md"),
    defaultUserSkillTemplateSystem(),
  );
  await writeTextFileIfMissing(
    path.join(userTemplateRoot, "checklist.md"),
    defaultUserSkillTemplateChecklist(),
  );

  for (const skillTemplate of foundationalAgentSkills()) {
    const parsedManifest = agentSkillSchema.parse(skillTemplate.manifest);
    const skillDir = path.join(skillsRoot, parsedManifest.id);
    await ensureDir(skillDir);

    const manifestPath = path.join(skillDir, "skill.json");
    const systemPath = path.join(skillDir, parsedManifest.files.system);
    const checklistPath = path.join(skillDir, parsedManifest.files.checklist);

    if (!(await pathExists(manifestPath))) {
      await writeJsonDeterministic(manifestPath, parsedManifest);
    }

    await writeTextFileIfMissing(systemPath, skillTemplate.system);
    await writeTextFileIfMissing(checklistPath, skillTemplate.checklist);
  }

  await syncRegistry(cwd, { archAgentsDir: agentsRoot });
}

export async function initializeProject(options: InitOptions, cwd = process.cwd()): Promise<void> {
  if (options.template !== "nextjs-turbo") {
    throw new Error(`Unsupported template '${options.template}'. Expected nextjs-turbo`);
  }
  if (options.pm !== "pnpm") {
    throw new Error(`Unsupported package manager '${options.pm}'. Expected pnpm`);
  }

  const managedWriteState: ManagedWriteState = {
    cwd,
    force: options.force === true,
    created: [],
    overwritten: [],
    skipped: [],
  };
  const fixedDirs = [
    "arch-model",
    "arch-domains",
    "architecture/content",
    "architecture/data",
    "architecture/governance",
    "architecture/operations",
    "architecture/product-framing",
    "architecture/runtime",
    "architecture/systems",
    "architecture/templates",
    "architecture/foundation",
    "architecture/legacy-architecture",
    "architecture/standards",
    "architecture/reference/examples",
    "architecture/reference/design-notes",
    "architecture/reference/experiments",
  ];

  for (const dir of fixedDirs) {
    await ensureDirIfMissing(cwd, dir);
  }

  if (options.withAi) {
    await ensureDirIfMissing(cwd, path.join("ai", "indexing"));
  }

  if (options.withWorkflows) {
    await ensureDirIfMissing(cwd, path.join(".project-arch", "workflows"));
  }

  const docsRoot = projectDocsRoot(cwd);
  await ensureDir(docsRoot);
  await ensureDir(path.join(docsRoot, "projects"));
  await ensureDir(path.join(docsRoot, "phases"));
  await ensureDir(path.join(docsRoot, "decisions"));
  await ensureDecisionIndex(path.join(docsRoot, "decisions"));

  const sharedProjectId = "shared";
  const phaseId = "phase-1";
  const milestoneId = "milestone-1-setup";
  const now = currentDateISO();

  const sharedProjectPath = projectDir(sharedProjectId, cwd);
  await ensureDir(sharedProjectPath);
  await ensureDir(projectPhasesRoot(sharedProjectId, cwd));

  await writeManagedJsonFile(
    projectManifestPath(sharedProjectId, cwd),
    defaultProjectManifest(sharedProjectId, {
      title: "Shared",
      type: "shared",
      summary: "Cross-cutting platform, architecture, and dependency work shared across projects.",
      ownedPaths: ["roadmap", "architecture"],
      sharedDependencies: [],
      defaultPhase: phaseId,
      tags: ["shared", "foundation"],
    }),
    managedWriteState,
  );

  const sharedOverviewPath = projectOverviewPath(sharedProjectId, cwd);
  if (!(await pathExists(sharedOverviewPath))) {
    await writeMarkdownFile(
      sharedOverviewPath,
      [
        "# Shared",
        "",
        "This project is the reserved cross-cutting planning scope for architecture,",
        "platform, and dependency work that spans multiple delivery surfaces.",
        "",
        "## Project Type",
        "",
        "shared",
        "",
        "## Purpose",
        "",
        "Coordinate repository-wide architecture, platform, and dependency work",
        "that does not belong to a single delivery project.",
        "",
        "## Owned Paths",
        "",
        "- roadmap",
        "- architecture",
        "",
        "## Shared Dependencies",
        "",
        "- None by default",
        "",
        "## Delivery Notes",
        "",
        "- Use this project for cross-project planning and shared infrastructure work.",
        "- Create additional named projects for product- or surface-specific delivery streams.",
        "",
        "## Adding Custom Projects",
        "",
        "When work belongs to a specific app, product, service, or client rather than to shared platform scope, create a new project under `roadmap/projects/<name>/`.",
        "",
        "Naming guidance:",
        "",
        "- Use repository-meaningful names such as `storefront`, `backoffice`, `customer-portal`, or `ops-console`.",
        "- Do not treat `app-*` as a required naming convention.",
        "- Reserve `shared` for the default cross-cutting project scaffolded by init.",
        "",
        "Each custom project should include:",
        "",
        "- `manifest.json` with stable identity and ownership metadata",
        "- `overview.md` describing purpose and boundaries",
        "- `phases/` for project-owned planning execution",
        "",
      ].join("\n"),
    );
  }

  await writeManagedJsonFile(
    path.join(docsRoot, "manifest.json"),
    {
      schemaVersion: "2.0",
      phases: [{ id: phaseId, projectId: DEFAULT_PHASE_PROJECT_ID, createdAt: now }],
      activeProject: DEFAULT_PHASE_PROJECT_ID,
      activePhase: phaseId,
      activeMilestone: milestoneId,
    },
    managedWriteState,
  );

  await writeManagedJsonFile(
    path.join(docsRoot, "policy.json"),
    defaultPolicyFileDocument(),
    managedWriteState,
  );

  const projectPhasePath = projectPhaseDir(DEFAULT_PHASE_PROJECT_ID, phaseId, cwd);
  await ensureDir(path.join(projectPhasePath, "milestones"));
  await ensureDir(projectPhaseDecisionsRoot(DEFAULT_PHASE_PROJECT_ID, phaseId, cwd));
  await ensureDecisionIndex(projectPhaseDecisionsRoot(DEFAULT_PHASE_PROJECT_ID, phaseId, cwd));

  await writeManagedMarkdownFile(
    path.join(projectPhasePath, "overview.md"),
    {
      schemaVersion: "2.0",
      type: "phase-overview",
      id: phaseId,
      createdAt: now,
      updatedAt: now,
    },
    [
      "# Overview",
      "",
      "Phase 1 establishes architecture before feature milestones begin.",
      "",
      "## Focus",
      "",
      "- Add the project setup prompt to architecture/product-framing/prompt.md",
      "  as the canonical source.",
      "- Complete architecture/product-framing with project overview, goals,",
      "  journey, and scope details derived from prompt.md.",
      "- Ensure agents can plan implementation from architecture",
      "  without missing context.",
      "",
    ].join("\n"),
    managedWriteState,
  );

  await writeManagedJsonFile(
    path.join(projectPhasePath, "validation-contract.json"),
    defaultValidationContractTemplate(phaseId),
    managedWriteState,
  );

  const projectMilestonePath = projectMilestoneDir(
    DEFAULT_PHASE_PROJECT_ID,
    phaseId,
    milestoneId,
    cwd,
  );
  await ensureDir(
    projectMilestoneTaskLaneDir(DEFAULT_PHASE_PROJECT_ID, phaseId, milestoneId, "planned", cwd),
  );
  await ensureDir(
    projectMilestoneTaskLaneDir(DEFAULT_PHASE_PROJECT_ID, phaseId, milestoneId, "discovered", cwd),
  );
  await ensureDir(
    projectMilestoneTaskLaneDir(DEFAULT_PHASE_PROJECT_ID, phaseId, milestoneId, "backlog", cwd),
  );
  await ensureDir(
    projectMilestoneDecisionsRoot(DEFAULT_PHASE_PROJECT_ID, phaseId, milestoneId, cwd),
  );
  await ensureDecisionIndex(
    projectMilestoneDecisionsRoot(DEFAULT_PHASE_PROJECT_ID, phaseId, milestoneId, cwd),
  );
  await writeManagedJsonFile(
    path.join(projectMilestonePath, "manifest.json"),
    {
      schemaVersion: "2.0",
      id: milestoneId,
      phaseId,
      createdAt: now,
      updatedAt: now,
    },
    managedWriteState,
  );
  await writeManagedMarkdownFile(
    path.join(projectMilestonePath, "overview.md"),
    {
      schemaVersion: "2.0",
      type: "milestone-overview",
      id: milestoneId,
      phaseId,
      createdAt: now,
      updatedAt: now,
    },
    [
      "# Overview",
      "",
      "This milestone creates the baseline project architecture and workflow assets.",
      "",
    ].join("\n"),
    managedWriteState,
  );
  const projectTargetsPath = projectMilestoneTargetsPath(
    DEFAULT_PHASE_PROJECT_ID,
    phaseId,
    milestoneId,
    cwd,
  );
  if (!(await pathExists(projectTargetsPath))) {
    await writeMarkdownFile(projectTargetsPath, milestoneTargetsTemplate());
  }

  for (const task of bootstrapTasks) {
    const frontmatter = defaultTaskFrontmatter({
      id: task.id,
      slug: task.slug,
      title: task.title,
      lane: "planned",
      createdAt: now,
      discoveredFromTask: null,
      taskType: task.taskType,
      agentExecutable: task.agentExecutable,
    });

    frontmatter.tags = task.tags;
    frontmatter.completionCriteria = task.completionCriteria;
    frontmatter.codeTargets = task.codeTargets ?? [];
    frontmatter.publicDocs = task.publicDocs ?? [];
    frontmatter.traceLinks = task.traceLinks ?? [];
    if (task.dependsOn) {
      frontmatter.dependsOn = task.dependsOn;
    }
    await writeManagedMarkdownFile(
      path.join(
        projectMilestoneTaskLaneDir(DEFAULT_PHASE_PROJECT_ID, phaseId, milestoneId, "planned", cwd),
        `${task.id}-${task.slug}.md`,
      ),
      frontmatter,
      renderTaskBody(task),
      managedWriteState,
    );
  }

  const productFramingDocs: Array<{ file: string; content: string[] }> = [
    {
      file: "prompt.md",
      content: [
        "# Setup Prompt",
        "",
        "Paste your foundational project prompt in this file.",
        "",
        "This is the canonical source used by `roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/tasks/planned/*` to derive:",
        "",
        "- `project-overview.md`",
        "- `goals.md`",
        "- `user-journey.md`",
        "- `scope.md`",
        "",
        "## Prompt Status",
        "",
        "- [ ] Replaced template text with real project prompt",
        "- [ ] Prompt includes purpose, users, constraints, and non-goals",
        "",
        "## Source Prompt",
        "",
        "```md",
        "PASTE_FOUNDATIONAL_PROMPT_HERE",
        "```",
      ],
    },
    {
      file: "project-overview.md",
      content: [
        "# Project Overview",
        "",
        "Describe what this project is, who it serves, and why it exists.",
        "",
        "Source: `architecture/product-framing/prompt.md`",
        "",
        "## Problem Statement",
        "",
        "...",
        "",
        "## Intended Users",
        "",
        "...",
        "",
        "## Assumptions",
        "",
        "- ...",
        "",
        "## Unknowns",
        "",
        "- ...",
        "",
        "## Risks",
        "",
        "- ...",
      ],
    },
    {
      file: "goals.md",
      content: [
        "# Project Goals",
        "",
        "List measurable goals that define project success.",
        "",
        "Source: `architecture/product-framing/prompt.md`",
        "",
        "## Primary Goals",
        "",
        "- ...",
        "",
        "## Secondary Goals",
        "",
        "- ...",
        "",
        "## Assumptions",
        "",
        "- ...",
        "",
        "## Unknowns",
        "",
        "- ...",
        "",
        "## Risks",
        "",
        "- ...",
      ],
    },
    {
      file: "user-journey.md",
      content: [
        "# User Journey",
        "",
        "Describe the end-to-end user flow this project supports.",
        "",
        "Source: `architecture/product-framing/prompt.md`",
        "",
        "## Journey Steps",
        "",
        "1. ...",
        "2. ...",
        "3. ...",
        "",
        "## Assumptions",
        "",
        "- ...",
        "",
        "## Unknowns",
        "",
        "- ...",
        "",
        "## Risks",
        "",
        "- ...",
      ],
    },
    {
      file: "scope.md",
      content: [
        "# Scope And Non-Scope",
        "",
        "Define what is explicitly in scope and out of scope for this project.",
        "",
        "Source: `architecture/product-framing/prompt.md`",
        "",
        "## In Scope",
        "",
        "- ...",
        "",
        "## Out Of Scope",
        "",
        "- ...",
        "",
        "## Assumptions",
        "",
        "- ...",
        "",
        "## Unknowns",
        "",
        "- ...",
        "",
        "## Risks",
        "",
        "- ...",
      ],
    },
  ];

  for (const doc of productFramingDocs) {
    const docPath = path.join(cwd, "architecture", "product-framing", doc.file);
    if (!(await pathExists(docPath))) {
      await writeMarkdownFile(docPath, doc.content.join("\n"));
    }
  }

  const aiDocsReadmePath = path.join(cwd, "architecture", "README.md");
  if (!(await pathExists(aiDocsReadmePath))) {
    const aiDocsReadme = [
      "# Architecture Directory",
      "",
      "This directory is the source of truth for agents and contributors. Use it to understand project intent, scope, architecture, standards, and execution constraints.",
      "",
      "## Purpose",
      "",
      "- act as the root index for architecture documentation",
      "- define the canonical taxonomy used by generated docs and future scaffolding",
      "- explain where authoritative versus supporting documents belong",
      "",
      "## Read First",
      "",
      "Read `system.md` first for the architecture entrypoint.",
      "Read `REPO_INDEX.md` second for the semantic model of the repository.",
      "Read `../arch-model/README.md` for machine-readable codebase topology.",
      "Read `../.arch/graph.json` for architecture traceability relationships.",
      "",
      "## Authority Rules",
      "",
      "- This README is the root index and navigation contract for the `architecture/` directory.",
      "- Family README files define what belongs in each top-level family.",
      "- Documents inside each family provide the actual project-specific content.",
      "- Legacy directories such as `foundation/`, `legacy-architecture/`, and `reference/` are supporting transitional structure and must not override the canonical taxonomy.",
      "",
      "## Canonical Taxonomy",
      "",
      "The recommended top-level `architecture/` taxonomy is:",
      "",
      "- `product-framing/`: goals, concepts, scope, and risk framing",
      "- `systems/`: major systems, user-facing flows, and subsystem definitions",
      "- `data/`: state, schema, persistence, archival, and recovery models",
      "- `runtime/`: execution topology, boundaries, and scheduling/runtime behavior",
      "- `content/`: content, configuration, and authoring workflows",
      "- `standards/`: implementation and engineering standards",
      "- `governance/`: repo model, ownership rules, and governance guidance",
      "- `operations/`: deployment, security, recovery, and operational guidance",
      "- `templates/`: canonical architecture document templates",
      "",
      "This taxonomy is recommended by default and organized by document role rather than project subject matter.",
      "",
      "## Boundary Highlights",
      "",
      "- `standards/` defines binding implementation rules; `governance/` defines authority, ownership, and architecture control.",
      "- `governance/` defines policy and control; `operations/` defines runbooks and operational procedures.",
      "- `systems/` defines major system behavior; `runtime/` defines execution topology and runtime constraints.",
      "- `content/` defines authoring and configuration formats; `systems/` defines behavior.",
      "- `data/` defines state and persistence; `runtime/` defines execution flow and scheduling.",
      "- `product-framing/` defines why and what; `systems/` defines how major capabilities behave.",
      "",
      "## Family Status",
      "",
      "- Families may be unused or empty in a given repository if the project does not need them yet.",
      "- When a family is unused, keep the top-level taxonomy readable rather than inventing an alternative structure.",
      "- When content does not clearly fit a family, prefer updating family guidance over creating an ad hoc top-level directory.",
      "- `standards/` should remain explicit when standards are in use.",
      "- `templates/` should remain explicit when first-party templates are present.",
      "",
      "## Adaptation Rules",
      "",
      "- A repository does not need to populate every family up front.",
      "- A family may be deferred until the repository has content that clearly belongs there.",
      "- A family may remain present but empty when `pa init` scaffolds it for consistency.",
      "- Families with no relevant content may be omitted from active use so long as the canonical vocabulary remains understandable in the root README.",
      "- Renaming canonical families should be avoided because it weakens shared vocabulary across repositories and tooling.",
      "- Merging families is acceptable only when the resulting location still preserves the canonical role distinction in documented guidance.",
      "- If a project adapts the taxonomy, it should document the adaptation in `architecture/README.md` instead of inventing a silent structural fork.",
      "",
      "## Migration And Normalization",
      "",
      "- Existing repositories do not need a flag day migration to adopt the canonical taxonomy.",
      "- Normalize by document role first: move framing docs into `product-framing/`, behavior docs into `systems/`, state docs into `data/`, and runtime docs into `runtime/`.",
      "- Keep legacy directories readable during transition, but lower their authority and stop treating them as the default authoring surface.",
      "- If migration is partial, record the adopted families and any remaining legacy locations in this README.",
      "- Use [`governance/taxonomy-migration.md`](governance/taxonomy-migration.md) as the detailed normalization guide.",
      "",
      "## Init Output Tier Model",
      "",
      "- `pa init` uses a tiered scaffold model so not every helpful surface is treated as equally default.",
      "- Tier A means always scaffolded surfaces.",
      "- Tier B means template scaffolded surfaces required by the selected template.",
      "- Tier C means catalog-only topics that should be visible without being scaffolded by default.",
      "- Tier D means optional add-ons that should only be created when explicitly adopted or safely widened later.",
      "- The working mode split is `pa init = Tier A + applicable Tier B` and `pa init --full = Tier A + applicable Tier B + scaffoldable Tier C + safe Tier D`.",
      "- Use [`governance/init-tier-model.md`](governance/init-tier-model.md) as the detailed tier-model definition.",
      "- Use [`governance/init-default-behavior.md`](governance/init-default-behavior.md) as the detailed definition of the smallest coherent default scaffold.",
      "- Use [`governance/init-full-behavior.md`](governance/init-full-behavior.md) as the detailed definition of the broadest first-party scaffold mode.",
      "- Use [`governance/init-surface-tier-mapping.md`](governance/init-surface-tier-mapping.md) for the current surface-category placement map.",
      "- Use [`governance/init-sprawl-guardrails.md`](governance/init-sprawl-guardrails.md) for the admission rules future surfaces must satisfy.",
      "- Use [`governance/setup-planning-tranches.md`](governance/setup-planning-tranches.md) for the reusable project-agnostic setup planning lanes.",
      "- Use [`governance/setup-task-ordering.md`](governance/setup-task-ordering.md) for reusable setup milestone sequencing and dependency rules.",
      "- Use [`governance/setup-discovery-boundary.md`](governance/setup-discovery-boundary.md) for the boundary between planned setup work and true discovery.",
      "- Use [`governance/setup-validation-placement.md`](governance/setup-validation-placement.md) for where setup validation, cleanup, and normalization should appear.",
      "- Use [`governance/setup-template-shape.md`](governance/setup-template-shape.md) for the recommended revised setup milestone shape that assembles these rules into one template.",
      "- Use [`governance/agent-surface-strategy.md`](governance/agent-surface-strategy.md) for the canonical first-party agent-surface model.",
      "- Use [`governance/agent-entry-point-file-list.md`](governance/agent-entry-point-file-list.md) for the ratified default entry-point file inventory that later agent-entry scaffolding should materialize.",
      "- Use [`governance/agent-entry-point-content-model.md`](governance/agent-entry-point-content-model.md) for the shared content model that canonical agent entry-point files should follow.",
      "- Use [`governance/agent-entry-point-scaffolding.md`](governance/agent-entry-point-scaffolding.md) for how `pa init` should create canonical agent entry-point files and behave on re-init.",
      "- Use [`governance/agent-entry-point-exclusions.md`](governance/agent-entry-point-exclusions.md) for what is intentionally excluded from the default scaffold and what later compatibility hooks may exist.",
      "- Use [`governance/workflow-scaffolding-scope.md`](governance/workflow-scaffolding-scope.md) for the downstream scope and role of workflow scaffolding after canonical entry points and context support are in place.",
      "- Use [`governance/workflow-initial-set.md`](governance/workflow-initial-set.md) for the constrained first-pass workflow inventory that later workflow scaffolding should materialize.",
      "- Use [`governance/workflow-context-consumption.md`](governance/workflow-context-consumption.md) for the workflow-specific rules that bind workflow helpers to the canonical CLI context contract.",
      "- Use [`governance/workflow-init-tier-placement.md`](governance/workflow-init-tier-placement.md) for the rule that places workflow scaffolding in the init tier model and keeps it out of default scaffold drift.",
      "- Use [`governance/workflow-generation-surfaces.md`](governance/workflow-generation-surfaces.md) for the first-pass supported workflow target surfaces and the excluded compatibility surfaces.",
      "- Use [`governance/workflow-file-inventory.md`](governance/workflow-file-inventory.md) for the exact first-pass generated workflow file inventory on the supported surface.",
      "- Use [`governance/workflow-content-model.md`](governance/workflow-content-model.md) for the shared structure and authority model that generated workflow files must follow.",
      "- Use [`governance/workflow-generation-behavior.md`](governance/workflow-generation-behavior.md) for how workflow files are generated, regenerated, and preserved once workflow generation is introduced.",
      "- Use [`governance/cli-context-contract.md`](governance/cli-context-contract.md) for the purpose and boundary of the future context-resolution command surface.",
      "- Use [`governance/cli-context-payload.md`](governance/cli-context-payload.md) for the minimum structured payload that future context consumers should expect.",
      "- Use [`governance/cli-context-consumption.md`](governance/cli-context-consumption.md) for how workflows, prompts, and agent integrations should consume resolved context consistently.",
      "- Use [`governance/cli-context-surface-relationships.md`](governance/cli-context-surface-relationships.md) for how context resolution differs from `pa next` and broader reporting surfaces.",
      "- Use [`governance/learn-command-boundary.md`](governance/learn-command-boundary.md) for the purpose, scope, and read-only boundary of `pa learn --path`.",
      "- Use [`governance/learn-report-contract.md`](governance/learn-report-contract.md) for the minimum human-readable and JSON report contract for `pa learn --path`.",
      "- Use [`governance/learn-check-doctor-relationship.md`](governance/learn-check-doctor-relationship.md) for command ownership rules between `pa learn --path`, `pa check`, and `pa doctor`.",
      "- Use [`governance/learn-future-extension-boundaries.md`](governance/learn-future-extension-boundaries.md) for the rule that keeps `pa learn --path` read-only until a later, separate mutation decision is approved.",
      "",
      "## Transitional Note",
      "",
      "Legacy directories such as `foundation/`, `legacy-architecture/`, and `reference/` may still exist during migration. They should be treated as transitional structure until taxonomy migration is completed.",
      "",
      "## Directory Map",
      "",
      "### product-framing/",
      "",
      "Project meaning, goals, scope, and risk framing.",
      "",
      "### systems/",
      "",
      "Major system definitions, user-facing workflows, and subsystem interactions.",
      "",
      "### data/",
      "",
      "State models, schemas, persistence boundaries, and archival/recovery definitions.",
      "",
      "### runtime/",
      "",
      "Execution model, topology, boundaries, and runtime constraints.",
      "",
      "### standards/",
      "",
      "Implementation standards and repository rules that are binding for code changes.",
      "",
      "**Agents must review all standards before implementing code.**",
      "",
      "- [`repo-structure.md`](standards/repo-structure.md): Repository layout and structural constraints.",
      "- [`react-standards.md`](standards/react-standards.md): React patterns, component conventions, and state boundaries.",
      "- [`nextjs-standards.md`](standards/nextjs-standards.md): Next.js routing, rendering, and data fetching expectations.",
      "- [`typescript-standards.md`](standards/typescript-standards.md): TypeScript usage patterns and type safety requirements.",
      "- [`markdown-standards.md`](standards/markdown-standards.md): Markdown formatting rules and linting expectations.",
      "- [`testing-standards.md`](standards/testing-standards.md): Testing strategies, coverage expectations, and test organization.",
      "- [`naming-conventions.md`](standards/naming-conventions.md): Naming patterns for files, functions, variables, and components.",
      "- [`turborepo-standards.md`](standards/turborepo-standards.md): Monorepo organization, task pipelines, and caching strategies.",
      "",
      "### governance/",
      "",
      "Repository model, ownership rules, and architecture governance guidance.",
      "",
      "- [`init-tier-model.md`](governance/init-tier-model.md): Formal definition of the `pa init` output-tier model and mode split.",
      "- [`init-default-behavior.md`](governance/init-default-behavior.md): Definition of the smallest coherent default `pa init` scaffold.",
      "- [`init-full-behavior.md`](governance/init-full-behavior.md): Definition of how `pa init --full` broadens beyond the default scaffold.",
      "- [`init-surface-tier-mapping.md`](governance/init-surface-tier-mapping.md): Mapping of current and proposed init surface categories into Tier A through Tier D.",
      "- [`init-sprawl-guardrails.md`](governance/init-sprawl-guardrails.md): Rules for preventing default-init and full-mode scaffold sprawl.",
      "- [`setup-planning-tranches.md`](governance/setup-planning-tranches.md): Reusable planning lanes for setup milestone templates so discovery is reserved for genuine expansion.",
      "- [`setup-task-ordering.md`](governance/setup-task-ordering.md): Reusable ordering and dependency rules for setup milestone sequencing.",
      "- [`setup-discovery-boundary.md`](governance/setup-discovery-boundary.md): Policy for what belongs in planned setup work versus what should still emerge through discovery.",
      "- [`setup-validation-placement.md`](governance/setup-validation-placement.md): Rules for placing synthesis, validation, cleanup, and normalization work near the end of setup milestones.",
      "- [`setup-template-shape.md`](governance/setup-template-shape.md): Recommended revised setup milestone template shape that replaces the older coarse setup pattern.",
      "- [`agent-surface-strategy.md`](governance/agent-surface-strategy.md): Canonical first-party agent surfaces that later entry-point milestones should scaffold.",
      "- [`agent-entry-point-file-list.md`](governance/agent-entry-point-file-list.md): Ratified default file and directory inventory for canonical agent entry-point scaffolding.",
      "- [`agent-entry-point-content-model.md`](governance/agent-entry-point-content-model.md): Shared content structure and authority model for canonical agent entry-point files.",
      "- [`agent-entry-point-scaffolding.md`](governance/agent-entry-point-scaffolding.md): Init materialization and re-init behavior for canonical agent entry-point scaffolding.",
      "- [`agent-entry-point-exclusions.md`](governance/agent-entry-point-exclusions.md): Explicit exclusions and later compatibility hooks for the agent entry-point milestone.",
      "- [`workflow-scaffolding-scope.md`](governance/workflow-scaffolding-scope.md): Downstream helper scope for workflow scaffolding after canonical entry points and CLI context support exist.",
      "- [`workflow-initial-set.md`](governance/workflow-initial-set.md): Constrained first-pass workflow inventory and the reason those workflows are prioritized first.",
      "- [`workflow-context-consumption.md`](governance/workflow-context-consumption.md): Workflow-specific context consumption rules that eliminate placeholder-driven workflow design.",
      "- [`workflow-init-tier-placement.md`](governance/workflow-init-tier-placement.md): Tier-model placement and optionality rule for workflow scaffolding surfaces.",
      "- [`workflow-generation-surfaces.md`](governance/workflow-generation-surfaces.md): Supported first-pass workflow generation surface and excluded compatibility/future workflow targets.",
      "- [`workflow-file-inventory.md`](governance/workflow-file-inventory.md): First-pass generated workflow file inventory mapped onto the supported workflow surface.",
      "- [`workflow-content-model.md`](governance/workflow-content-model.md): Shared content structure and fail-safe rules for generated workflow files.",
      "- [`workflow-generation-behavior.md`](governance/workflow-generation-behavior.md): Invocation, overwrite, and regeneration rules for generated workflow files.",
      "- [`cli-context-contract.md`](governance/cli-context-contract.md): Purpose and boundary of the CLI context-resolution surface needed before workflow scaffolding.",
      "- [`cli-context-payload.md`](governance/cli-context-payload.md): Minimum structured payload that future context-resolution consumers should rely on.",
      "- [`cli-context-consumption.md`](governance/cli-context-consumption.md): Downstream consumption rules for workflows, prompts, and agent integrations.",
      "- [`cli-context-surface-relationships.md`](governance/cli-context-surface-relationships.md): Relationship rules between context resolution, `pa next`, and reporting surfaces.",
      "- [`learn-command-boundary.md`](governance/learn-command-boundary.md): Purpose, scope, and read-only boundary for `pa learn --path` as a path-scoped learning surface.",
      "- [`learn-report-contract.md`](governance/learn-report-contract.md): Minimum report contract for human-readable and JSON output from `pa learn --path`.",
      "- [`learn-check-doctor-relationship.md`](governance/learn-check-doctor-relationship.md): Ownership boundary and usage split between `pa learn --path`, `pa check`, and `pa doctor`.",
      "- [`learn-future-extension-boundaries.md`](governance/learn-future-extension-boundaries.md): Deferred-extension rule for any future `--fix` or `--apply` style behavior on `pa learn --path`.",
      "- [`taxonomy-migration.md`](governance/taxonomy-migration.md): Guidance for normalizing older architecture layouts into the canonical taxonomy without a flag day migration.",
      "",
      "### operations/",
      "",
      "Operational runbooks for deployment, recovery, privacy, and security topics.",
      "",
      "### content/",
      "",
      "Content, configuration, and authoring workflows.",
      "",
      "### templates/",
      "",
      "- [`ARCHITECTURE_SPEC_TEMPLATE.md`](templates/ARCHITECTURE_SPEC_TEMPLATE.md): Canonical template for major architecture specs.",
      "- [`GAP_CLOSURE_REPORT_TEMPLATE.md`](templates/GAP_CLOSURE_REPORT_TEMPLATE.md): Template for milestone gap-closure and remediation planning.",
      "",
      "### Supporting Files",
      "",
      "- [`templates-usage.md`](templates-usage.md): Guidance on when to use each template type (tasks, decisions, domains, etc.).",
      "- [`concept-map.json`](concept-map.json): Concept-to-artifact mapping for traceability.",
      "- `../.arch/`: Machine-readable architecture traceability graph (tasks, decisions, modules, domains).",
      "- `reference/`: Legacy informational examples, design notes, and experiments (non-authoritative, transitional).",
      "",
      "## Canonical Vs Supporting Docs",
      "",
      "- Canonical docs live in the top-level taxonomy families and define current project meaning or constraints.",
      "- Supporting docs provide templates, machine-readable maps, or transitional context.",
      "- Informational or legacy docs must not silently replace canonical family documents.",
      "",
      "## Agent Navigation Order",
      "",
      "1. Read `system.md` first.",
      "2. Read this README to understand the canonical taxonomy.",
      "3. Read `product-framing/`, `systems/`, `data/`, `runtime/`, and `governance/` as relevant to the work.",
      "4. **Read ALL `standards/` docs before proposing or implementing code.**",
      "5. Use legacy `foundation/`, `legacy-architecture/`, and `reference/` directories only when needed during the transition.",
      "6. Keep documentation updates synchronized with tasks and decisions in `roadmap/`.",
      "7. Verify `.arch/graph.json` reflects expected task/decision/module/domain links.",
    ].join("\n");
    await writeMarkdownFile(aiDocsReadmePath, aiDocsReadme);
  }

  const aiMapReadmePath = path.join(cwd, "arch-model", "README.md");
  if (!(await pathExists(aiMapReadmePath))) {
    const aiMapReadme = [
      "# AI Codebase Map",
      "",
      "This directory provides machine-readable maps of the codebase.",
      "",
      "Agents must consult these files before exploring the repository.",
      "",
      "Purpose:",
      "",
      "- accelerate navigation",
      "- reduce hallucinated architecture",
      "- clarify module responsibilities",
      "",
      "Primary files:",
      "",
      "- `modules.json`",
      "- `entrypoints.json`",
      "- `dependencies.json`",
      "- `ownership.json`",
      "- `surfaces.json`",
      "- `concept-map.json`",
    ].join("\n");
    await writeMarkdownFile(aiMapReadmePath, aiMapReadme);
  }

  const aiDomainsReadmePath = path.join(cwd, "arch-domains", "README.md");
  if (!(await pathExists(aiDomainsReadmePath))) {
    const aiDomainsReadme = [
      "# AI Domain Map",
      "",
      "This directory defines product problem-space domains and ownership boundaries.",
      "",
      "Agents must read this directory before implementing domain logic.",
      "",
      "Purpose:",
      "",
      "- define domain boundaries",
      "- map domains to owned packages and features",
      "- reduce placement ambiguity in large codebases",
      "",
      "Primary files:",
      "",
      "- `domains.json`",
      "- optional domain specs such as `<domain-name>.md`",
    ].join("\n");
    await writeMarkdownFile(aiDomainsReadmePath, aiDomainsReadme);
  }

  const domainsPath = path.join(cwd, "arch-domains", "domains.json");
  if (!(await pathExists(domainsPath))) {
    await writeJsonDeterministic(domainsPath, { domains: [] });
  }

  const domainTemplatePath = path.join(cwd, "arch-domains", "DOMAIN_TEMPLATE.md");
  if (!(await pathExists(domainTemplatePath))) {
    await writeMarkdownFile(
      domainTemplatePath,
      [
        "# Domain Template",
        "",
        "Use this template when adding a new domain.",
        "",
        "## Domain Name",
        "",
        "<domain-name>",
        "",
        "## Purpose",
        "",
        "Describe what business problem-space this domain owns.",
        "",
        "## Ownership",
        "",
        "### Team/Role Responsible",
        "",
        "- ...",
        "",
        "### Technical Owner",
        "",
        "- ...",
        "",
        "## Core Concepts",
        "",
        "- concept-a",
        "- concept-b",
        "",
        "## Interfaces",
        "",
        "### Public APIs",
        "",
        "List the public interfaces this domain exposes:",
        "",
        "- ...",
        "",
        "### Integration Points",
        "",
        "List how other domains interact with this domain:",
        "",
        "- ...",
        "",
        "## Boundaries",
        "",
        "### In Scope",
        "",
        "What capabilities fall within this domain:",
        "",
        "- ...",
        "",
        "### Out of Scope",
        "",
        "What capabilities explicitly do NOT belong to this domain:",
        "",
        "- ...",
        "",
        "## Non-Goals",
        "",
        "Explicitly state what this domain will not attempt to solve:",
        "",
        "- ...",
        "",
        "## Data Authority",
        "",
        "### Primary Data Ownership",
        "",
        "Entities this domain is the authoritative source for:",
        "",
        "- entity-a",
        "- entity-b",
        "",
        "### Data Dependencies",
        "",
        "Entities this domain consumes from other domains:",
        "",
        "- entity-c (from domain-x)",
        "",
        "## Implementation Surfaces",
        "",
        "- `packages/<module>`",
        "",
        "## Notes",
        "",
        "Additional context, assumptions, or constraints for this domain.",
        "",
      ].join("\n"),
    );
  }

  const architectureSpecTemplatePath = path.join(
    cwd,
    "architecture",
    "templates",
    "ARCHITECTURE_SPEC_TEMPLATE.md",
  );
  if (!(await pathExists(architectureSpecTemplatePath))) {
    await writeMarkdownFile(architectureSpecTemplatePath, defaultArchitectureSpecTemplate());
  }

  const conceptMapPath = path.join(cwd, "architecture", "concept-map.json");
  if (!(await pathExists(conceptMapPath))) {
    await writeJsonDeterministic(conceptMapPath, defaultConceptMapTemplate());
  }

  const gapClosureTemplatePath = path.join(
    cwd,
    "architecture",
    "templates",
    "GAP_CLOSURE_REPORT_TEMPLATE.md",
  );
  if (!(await pathExists(gapClosureTemplatePath))) {
    await writeMarkdownFile(gapClosureTemplatePath, defaultMilestoneGapClosureReportTemplate());
  }

  const templatesReadmePath = path.join(cwd, "architecture", "templates-usage.md");
  if (!(await pathExists(templatesReadmePath))) {
    const templatesUsageGuide = [
      "# Template Usage Guide",
      "",
      "This document defines when to use each template type.",
      "",
      "## When to Use Templates",
      "",
      "### Task Template",
      "",
      "**Use when**: Creating a new task in a milestone",
      "",
      "**CLI**: `pa task new {phase} {milestone}`",
      "",
      "---",
      "",
      "### Decision Template",
      "",
      "**Use when**: Making an architectural decision",
      "",
      "**CLI**: `pa decision new`",
      "",
      "**Frequency**: As needed when architecture choices are required",
      "",
      "---",
      "",
      "### Domain Spec Template",
      "",
      "**Use when**: Introducing a new business domain",
      "",
      "**Template location**: `arch-domains/DOMAIN_TEMPLATE.md`",
      "",
      "**Frequency**: 1-5 times per project phase",
      "",
      "**Do NOT use**: For every feature or module",
      "",
      "---",
      "",
      "### Architecture Spec Template",
      "",
      "**Use when**: Documenting a significant architectural component",
      "",
      "**Template location**: `architecture/templates/ARCHITECTURE_SPEC_TEMPLATE.md`",
      "",
      "**Frequency**: 2-8 times per project",
      "",
      "**Do NOT use**: For individual features or small components",
      "",
      "---",
      "",
      "### Concept-to-Artifact Mapping",
      "",
      "**Use when**: Planning milestone or reviewing architectural traceability",
      "",
      "**File**: `architecture/concept-map.json`",
      "",
      "**Frequency**: Once per milestone (updated as needed)",
      "",
      "**Do NOT use**: During individual task implementation",
      "",
      "---",
      "",
      "### Milestone Gap Closure Report",
      "",
      "**Use when**: ALL tasks in a milestone have status 'done'",
      "",
      "**Template location**: `architecture/templates/GAP_CLOSURE_REPORT_TEMPLATE.md`",
      "",
      "**Frequency**: Once per milestone at completion",
      "",
      "**Trigger conditions**:",
      "",
      "1. All planned tasks are done",
      "2. All discovered tasks are done",
      "3. Milestone objectives are met or formally deferred",
      "4. Team is ready to transition to next milestone",
      "",
      "**Do NOT use**:",
      "",
      "- During task creation",
      "- When any task is still in-progress or blocked",
      "- For individual task completion",
      "- During mid-milestone reviews",
      "",
      "---",
      "",
      "## Summary Matrix",
      "",
      "| Template | Frequency | Trigger Event |",
      "| -------- | --------- | ------------- |",
      "| Task | Per work item | Creating new task |",
      "| Decision | As needed | Architectural choice required |",
      "| Domain Spec | 1-5 per phase | New domain introduced |",
      "| Architecture Spec | 2-8 per project | Major architectural component |",
      "| Concept Map | Once per milestone | Milestone planning or review |",
      "| Gap Closure Report | Once per milestone | All tasks done |",
      "",
    ].join("\n");
    await writeMarkdownFile(templatesReadmePath, templatesUsageGuide);
  }

  const packageRoot = path.join(cwd, "packages");
  const packageEntries = (await pathExists(packageRoot))
    ? await fs.readdir(packageRoot, { withFileTypes: true })
    : [];
  const packageModules = packageEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));

  const moduleDescriptions: Record<string, string> = {
    "packages/ui": "Reusable UI components.",
    "packages/types": "Shared type definitions.",
    "packages/config": "Shared runtime and tooling configuration.",
    "packages/database": "Database schema and access layer.",
    "packages/api": "Shared API contracts and service logic.",
    "packages/eslint-config": "Shared linting configuration.",
    "packages/typescript-config": "Shared TypeScript configuration presets.",
  };

  const modules = packageModules.map((moduleName) => ({
    name: moduleName,
    type: moduleName === "packages/database" ? ("infrastructure" as const) : ("library" as const),
    description: moduleDescriptions[moduleName] ?? "Module in the monorepo.",
  }));

  const entrypointCandidates: Array<{ suffix: string; role: string }> = [
    { suffix: "app/layout.tsx", role: "application-root" },
    { suffix: "app/page.tsx", role: "homepage" },
    { suffix: "src/index.ts", role: "package-public-api" },
    { suffix: "src/index.tsx", role: "package-public-api" },
    { suffix: "index.ts", role: "package-public-api" },
  ];
  const entrypoints: Array<{ module: string; path: string; role: string }> = [];
  for (const moduleName of packageModules) {
    for (const candidate of entrypointCandidates) {
      const candidatePath = path.join(cwd, moduleName, candidate.suffix);
      if (await pathExists(candidatePath)) {
        entrypoints.push({
          module: moduleName,
          path: path.join(moduleName, candidate.suffix).split(path.sep).join("/"),
          role: candidate.role,
        });
      }
    }
  }

  const dependencies = {
    rules: [
      {
        from: "packages/ui",
        canDependOn: ["packages/types", "packages/config"],
      },
      {
        from: "packages/database",
        canDependOn: ["packages/types", "packages/config"],
      },
      {
        from: "packages/api",
        canDependOn: ["packages/types", "packages/config", "packages/database"],
      },
    ],
  };

  const ownership = {
    ownership: [
      {
        module: "packages/ui",
        owns: ["UI components", "design tokens", "shared layout primitives"],
      },
      {
        module: "packages/database",
        owns: ["Database schema", "data access", "migration logic"],
      },
      {
        module: "packages/api",
        owns: ["Service contracts", "API boundaries", "cross-app API abstractions"],
      },
    ].filter((item) => packageModules.includes(item.module)),
  };

  const surfaces = {
    surfaces: packageModules.map((moduleName) => ({
      module: moduleName,
      public: ["src/index.ts", "src/index.tsx", "index.ts"],
      private: ["src/internal/**"],
    })),
  };

  const modulesPath = path.join(cwd, "arch-model", "modules.json");
  if (!(await pathExists(modulesPath))) {
    await writeJsonDeterministic(modulesPath, { modules });
  }
  const entrypointsPath = path.join(cwd, "arch-model", "entrypoints.json");
  if (!(await pathExists(entrypointsPath))) {
    await writeJsonDeterministic(entrypointsPath, { entrypoints });
  }
  const dependenciesPath = path.join(cwd, "arch-model", "dependencies.json");
  if (!(await pathExists(dependenciesPath))) {
    await writeJsonDeterministic(dependenciesPath, dependencies);
  }
  const ownershipPath = path.join(cwd, "arch-model", "ownership.json");
  if (!(await pathExists(ownershipPath))) {
    await writeJsonDeterministic(ownershipPath, ownership);
  }
  const surfacesPath = path.join(cwd, "arch-model", "surfaces.json");
  if (!(await pathExists(surfacesPath))) {
    await writeJsonDeterministic(surfacesPath, surfaces);
  }

  const repoIndexPath = path.join(cwd, "architecture", "REPO_INDEX.md");
  if (!(await pathExists(repoIndexPath))) {
    const repoIndex = [
      "# Repository Index",
      "",
      "This document provides the semantic map of the repository.",
      "",
      "Agents must use this file to understand the role of each directory before performing work.",
      "",
      "---",
      "",
      "## Repository Model",
      "",
      "The repository is organized into five conceptual layers.",
      "",
      "Foundation -> Architecture -> Execution -> Runtime",
      "",
      "Each layer answers a different question.",
      "",
      "- Product + Architecture Docs: Why and how the system works. Location: `architecture/` using the canonical taxonomy.",
      "- Domains: What business problem-space is implemented. Location: `arch-domains`.",
      "- Execution: What is currently being built. Location: `roadmap`.",
      "- Runtime: Actual application code. Location: `apps`, `packages`.",
      "",
      "Agents must understand this hierarchy before making changes.",
      "",
      "---",
      "",
      "## Directory Responsibilities",
      "",
      "### architecture/",
      "",
      "Defines the meaning and constraints of the system.",
      "",
      "Subdirectories:",
      "",
      "product-framing/",
      "project intent, goals, scope, and risk framing",
      "",
      "systems/",
      "major systems, workflows, and subsystem definitions",
      "",
      "data/",
      "state, schema, persistence, and recovery models",
      "",
      "runtime/",
      "topology, boundaries, and runtime constraints",
      "",
      "standards/",
      "binding implementation and repository standards",
      "",
      "governance/",
      "repo model, ownership, and architecture governance",
      "",
      "operations/",
      "operational runbooks and recovery/security guidance",
      "",
      "content/",
      "content, configuration, and authoring workflows",
      "",
      "templates/",
      "canonical architecture templates",
      "",
      "Agents must treat this directory as the primary source of truth for system intent.",
      "Legacy directories such as `foundation/`, `legacy-architecture/`, and `reference/` may still exist during migration.",
      "Init scaffold scope is defined by the tier model in `architecture/governance/init-tier-model.md`.",
      "Default init scope is defined in `architecture/governance/init-default-behavior.md`.",
      "Full-mode init scope is defined in `architecture/governance/init-full-behavior.md`.",
      "Surface placement across the tier model is defined in `architecture/governance/init-surface-tier-mapping.md`.",
      "Future scaffold admission rules are defined in `architecture/governance/init-sprawl-guardrails.md`.",
      "Reusable setup planning lanes are defined in `architecture/governance/setup-planning-tranches.md`.",
      "Reusable setup ordering rules are defined in `architecture/governance/setup-task-ordering.md`.",
      "Reusable setup discovery boundaries are defined in `architecture/governance/setup-discovery-boundary.md`.",
      "Reusable setup validation and cleanup placement rules are defined in `architecture/governance/setup-validation-placement.md`.",
      "The assembled revised setup milestone shape is defined in `architecture/governance/setup-template-shape.md`.",
      "The canonical first-party agent-surface model is defined in `architecture/governance/agent-surface-strategy.md`.",
      "The canonical agent entry-point file inventory is defined in `architecture/governance/agent-entry-point-file-list.md`.",
      "The shared canonical agent entry-point content model is defined in `architecture/governance/agent-entry-point-content-model.md`.",
      "Canonical init behavior for agent entry-point scaffolding is defined in `architecture/governance/agent-entry-point-scaffolding.md`.",
      "Explicit exclusions and compatibility hooks for agent entry-point scaffolding are defined in `architecture/governance/agent-entry-point-exclusions.md`.",
      "Workflow scaffolding scope is defined in `architecture/governance/workflow-scaffolding-scope.md`.",
      "The first-pass workflow inventory is defined in `architecture/governance/workflow-initial-set.md`.",
      "Workflow-specific context consumption rules are defined in `architecture/governance/workflow-context-consumption.md`.",
      "Workflow init-tier placement is defined in `architecture/governance/workflow-init-tier-placement.md`.",
      "Supported workflow generation surfaces are defined in `architecture/governance/workflow-generation-surfaces.md`.",
      "The first-pass workflow file inventory is defined in `architecture/governance/workflow-file-inventory.md`.",
      "The generated workflow content model is defined in `architecture/governance/workflow-content-model.md`.",
      "Workflow generation and regeneration behavior is defined in `architecture/governance/workflow-generation-behavior.md`.",
      "The CLI context-resolution contract is defined in `architecture/governance/cli-context-contract.md`.",
      "The minimum CLI context payload is defined in `architecture/governance/cli-context-payload.md`.",
      "Downstream CLI context consumption rules are defined in `architecture/governance/cli-context-consumption.md`.",
      "CLI surface relationships for context, `pa next`, and reporting are defined in `architecture/governance/cli-context-surface-relationships.md`.",
      "The `pa learn --path` command boundary is defined in `architecture/governance/learn-command-boundary.md`.",
      "The `pa learn --path` report contract is defined in `architecture/governance/learn-report-contract.md`.",
      "The relationship between `pa learn --path`, `pa check`, and `pa doctor` is defined in `architecture/governance/learn-check-doctor-relationship.md`.",
      "Future mutation boundaries for `pa learn --path` are defined in `architecture/governance/learn-future-extension-boundaries.md`.",
      "Normalization guidance lives in `architecture/governance/taxonomy-migration.md`.",
      "",
      "---",
      "",
      "### roadmap/",
      "",
      "Defines execution state.",
      "",
      "Contains:",
      "",
      "phases/",
      "milestones/",
      "tasks/",
      "decisions/",
      "",
      "This directory answers:",
      "",
      '"What work is currently being executed?"',
      "",
      "Agents must only perform work that is represented here.",
      "",
      "---",
      "",
      "### arch-domains/",
      "",
      "Defines business domains and ownership boundaries.",
      "",
      "Contains:",
      "",
      "domains.json",
      "domain specification files (for example `<domain-name>.md`)",
      "",
      "This directory answers:",
      "",
      '"Which domain owns this logic and where should it be implemented?"',
      "",
      "Agents must align feature implementation to explicit domain ownership.",
      "",
      "---",
      "",
      "### .arch/",
      "",
      "Defines machine-readable architecture traceability links.",
      "",
      "Contains:",
      "",
      "graph.json",
      "nodes/*.json",
      "edges/*.json",
      "",
      "This directory answers:",
      "",
      '"Why does this code exist and which task/decision/domain does it map to?"',
      "",
      "Agents must keep traceability links synchronized with structural changes.",
      "",
      "---",
      "",
      "### packages/",
      "",
      "Runtime modules, shared infrastructure, and reusable building blocks.",
      "",
      "Typical packages include:",
      "",
      "ui",
      "database",
      "api",
      "types",
      "config",
      "",
      "Agents should implement reusable logic here.",
      "",
      "---",
      "",
      "## Work Execution Model",
      "",
      "Work progresses through this hierarchy.",
      "",
      "Phase -> Milestone -> Task -> Code",
      "",
      "Agents must not implement code without a corresponding task.",
      "",
      "---",
      "",
      "## Traceability Model",
      "",
      "The repository enforces traceability between artifacts.",
      "",
      "Task",
      "-> Decision (if architecture changes)",
      "-> Code implementation",
      "-> Documentation update",
      "",
      "Agents must maintain these relationships.",
      "",
      "---",
      "",
      "## Change Boundaries",
      "",
      "Agents must not modify:",
      "",
      "architecture/product-framing",
      "",
      "without explicit task or decision.",
      "",
      "Agents may modify:",
      "",
      "apps",
      "packages",
      "",
      "when implementing tasks.",
      "",
      "---",
      "",
      "## Agent Decision Hierarchy",
      "",
      "When conflicts occur, agents must resolve using the following priority order:",
      "",
      "1. `architecture/product-framing`",
      "2. `architecture/systems`",
      "3. `architecture/data`",
      "4. `architecture/runtime`",
      "5. `architecture/governance`",
      "6. `architecture/standards`",
      "7. `arch-domains`",
      "8. `roadmap/decisions`",
      "9. `roadmap/projects`",
      "10. `architecture/templates`",
      "11. `architecture/foundation`",
      "12. `architecture/legacy-architecture`",
      "13. `architecture/reference` (informational only)",
      "14. runtime code",
      "",
      "Higher layers override lower layers.",
      "Legacy directories remain available for incremental migration, not as the preferred authoring surface.",
      "",
      "---",
      "",
      "## Concept Creation Rule",
      "",
      "Agents must not introduce new architectural concepts during implementation.",
      "",
      "Concepts include:",
      "",
      "- domains",
      "- modules",
      "- features",
      "- system layers",
      "",
      "If a required concept does not exist, agents must:",
      "",
      "1. create a decision proposal",
      "2. document the concept in architecture, arch-domains, or arch-model as appropriate",
      "3. wait for approval before implementation",
      "",
      "---",
      "",
      "## CLI Tooling",
      "",
      "When available, agents must use repository CLI tools for structural changes.",
      "",
      "Examples:",
      "",
      "pa phase new {phase-id}",
      "pa milestone new {phase-id} {milestone-id}",
      "pa task new {phase-id} {milestone-id}",
      "pa decision new",
      "",
      "Agents must not manually create structural artifacts if CLI tools exist.",
      "",
      "---",
      "",
      "## Summary",
      "",
      "This repository follows a documentation-first architecture model.",
      "",
      "Meaning is defined first.",
      "Execution follows documentation.",
      "Code implements documented decisions.",
      "",
      "Agents must maintain this structure when performing work.",
    ].join("\n");
    await writeMarkdownFile(repoIndexPath, repoIndex);
  }

  const areaReadmes: Array<{ area: string; fileName: string; title: string; description: string }> =
    [
      {
        area: "content",
        fileName: "README.md",
        title: "Content",
        description:
          "Recommended family for content models, configuration authoring formats, and authoring workflows.",
      },
      {
        area: "data",
        fileName: "README.md",
        title: "Data",
        description:
          "Recommended family for state models, schemas, persistence boundaries, archival, and recovery guidance.",
      },
      {
        area: "governance",
        fileName: "README.md",
        title: "Governance",
        description:
          "Recommended family for repository model, ownership rules, and architecture governance guidance.",
      },
      {
        area: "operations",
        fileName: "README.md",
        title: "Operations",
        description:
          "Recommended family for deployment, recovery, privacy, security, and other operational runbooks.",
      },
      {
        area: "product-framing",
        fileName: "README.md",
        title: "Product Framing",
        description:
          "Recommended family for goals, concepts, scope framing, and risk framing artifacts.",
      },
      {
        area: "runtime",
        fileName: "README.md",
        title: "Runtime",
        description:
          "Recommended family for runtime topology, execution model, boundaries, and critical path guidance.",
      },
      {
        area: "systems",
        fileName: "README.md",
        title: "Systems",
        description:
          "Recommended family for major systems, user-facing workflows, and subsystem interaction models.",
      },
      {
        area: "templates",
        fileName: "README.md",
        title: "Templates",
        description:
          "Recommended family for canonical architecture document templates and related template guidance.",
      },
      {
        area: "systems",
        fileName: "system-boundaries.md",
        title: "System Boundaries",
        description: "Define canonical domain boundaries, ownership, and interaction constraints.",
      },
      {
        area: "governance",
        fileName: "module-model.md",
        title: "Module Model",
        description:
          "Define module responsibilities and composition rules across apps and packages.",
      },
      {
        area: "runtime",
        fileName: "runtime-architecture.md",
        title: "Runtime Architecture",
        description: "Define runtime flows, critical paths, and deployment/runtime constraints.",
      },
      {
        area: "standards",
        fileName: "repo-structure.md",
        title: "Repository Structure Standards",
        description: "Define repository layout, naming conventions, and structural constraints.",
      },
      {
        area: "standards",
        fileName: "react-standards.md",
        title: "React Standards",
        description:
          "Define React implementation patterns, component conventions, and state boundaries.",
      },
      {
        area: "standards",
        fileName: "nextjs-standards.md",
        title: "Next.js Standards",
        description:
          "Define routing, rendering, data fetching, and cache behavior expectations for Next.js surfaces.",
      },
      {
        area: "standards",
        fileName: "typescript-standards.md",
        title: "TypeScript Standards",
        description:
          "Define TypeScript usage patterns, type safety requirements, and compiler configuration expectations.",
      },
      {
        area: "standards",
        fileName: "markdown-standards.md",
        title: "Markdown Standards",
        description:
          "Define markdown formatting rules, linting expectations, and documentation structure requirements.",
      },
      {
        area: "standards",
        fileName: "testing-standards.md",
        title: "Testing Standards",
        description:
          "Define testing strategies, coverage expectations, and test organization patterns.",
      },
      {
        area: "standards",
        fileName: "naming-conventions.md",
        title: "Naming Conventions",
        description:
          "Define naming patterns for files, functions, variables, components, and modules.",
      },
      {
        area: "standards",
        fileName: "turborepo-standards.md",
        title: "Turborepo Standards",
        description:
          "Define monorepo organization, task pipelines, caching strategies, and workspace conventions.",
      },
      {
        area: "foundation",
        fileName: "README.md",
        title: "Legacy Foundation",
        description:
          "Transitional location for older product-framing documents. Keep readable during migration, but move active authoritative framing docs into `architecture/product-framing/`.",
      },
      {
        area: "legacy-architecture",
        fileName: "README.md",
        title: "Legacy Architecture",
        description:
          "Transitional location for older architecture behavior documents. Keep readable during migration, but move active authoritative docs into canonical families such as `systems/`, `runtime/`, and `governance/`.",
      },
      {
        area: "reference",
        fileName: "README.md",
        title: "Reference Material",
        description:
          "Informational notes, examples, and experiments. These documents are non-authoritative and cannot override foundation, architecture, or standards.",
      },
      {
        area: "reference/examples",
        fileName: "README.md",
        title: "Examples",
        description: "Example implementations and snippets for context only.",
      },
      {
        area: "reference/design-notes",
        fileName: "README.md",
        title: "Design Notes",
        description: "Exploratory design notes and rationale drafts for context only.",
      },
      {
        area: "reference/experiments",
        fileName: "README.md",
        title: "Experiments",
        description: "Technical experiments and spike outcomes for context only.",
      },
    ];

  for (const readme of areaReadmes) {
    const readmePath = path.join(cwd, "architecture", readme.area, readme.fileName);
    if (!(await pathExists(readmePath))) {
      let content: string;

      // Generate detailed content for standards files
      if (readme.area === "standards") {
        content = generateStandardsContent(readme.fileName, readme.title, readme.description);
      } else if (
        [
          "content",
          "data",
          "foundation",
          "governance",
          "operations",
          "product-framing",
          "runtime",
          "systems",
          "templates",
          "legacy-architecture",
        ].includes(readme.area) &&
        readme.fileName === "README.md"
      ) {
        content = generateArchitectureFamilyReadme(readme.area, readme.title, readme.description);
      } else {
        content = [`# ${readme.title}`, "", readme.description, ""].join("\n");
      }

      await writeMarkdownFile(readmePath, content);
    }
  }

  await scaffoldGovernanceGuidanceDocs(cwd, { pathExists, writeMarkdownFile });

  const architectureSystemPath = path.join(cwd, "architecture", "system.md");
  if (!(await pathExists(architectureSystemPath))) {
    const architectureSystem = [
      "# System",
      "",
      "This is the single-entry architecture overview for the repository.",
      "",
      "## Purpose",
      "",
      "- Define what the system is and why it exists.",
      "- Summarize domain boundaries and module structure.",
      "- Point contributors and agents to canonical sources.",
      "",
      "## Read Next",
      "",
      "1. `README.md`",
      "2. `product-framing/`",
      "3. `systems/`, `data/`, `runtime/`, `governance/`, `standards/`",
      "4. `../arch-domains/`",
      "5. `../arch-model/`",
      "6. `../roadmap/`",
      "",
      "## Source Of Truth",
      "",
      "- Architecture meaning and constraints: `architecture/`",
      "- Domain boundaries: `arch-domains/`",
      "- Module topology and ownership: `arch-model/`",
      "- Execution state and delivery flow: `roadmap/`",
    ].join("\n");
    await writeMarkdownFile(architectureSystemPath, architectureSystem);
  }

  const turboPath = path.join(cwd, "turbo.json");
  if (!(await pathExists(turboPath))) {
    await writeJsonDeterministic(turboPath, {
      $schema: "https://turbo.build/schema.json",
      tasks: {
        build: {
          dependsOn: ["^build"],
          outputs: ["dist/**"],
        },
      },
    });
  }

  const workspacePath = path.join(cwd, "pnpm-workspace.yaml");
  if (!(await pathExists(workspacePath))) {
    const content = ["packages:", "  - packages/*", ""].join("\n");
    await ensureDir(path.dirname(workspacePath));
    await fs.writeFile(workspacePath, content, "utf8");
  }

  const rootPackagePath = path.join(cwd, "package.json");
  if (!(await pathExists(rootPackagePath))) {
    await writeJsonDeterministic(rootPackagePath, {
      name: "repo",
      private: true,
      packageManager: "pnpm@10.30.3",
      scripts: {
        build: "turbo run build",
      },
    });
  }

  await scaffoldAgentsGuide(cwd, { pathExists, writeMarkdownFile });

  if (options.withWorkflows) {
    for (const workflowDefinition of generatedWorkflowDefinitions) {
      await writeManagedFile(
        path.join(cwd, ".project-arch", "workflows", `${workflowDefinition.slug}.workflow.md`),
        renderGeneratedWorkflowFile(workflowDefinition),
        managedWriteState,
      );
    }
  }

  await scaffoldAgentsOfArch(cwd);

  // Initialize feedback system stores
  const archDir = path.join(cwd, ".arch");
  const observationStore = new ObservationStore(archDir);
  const issueStore = new IssueStore(archDir);
  await observationStore.initialize();
  await issueStore.initialize();

  flushManagedWriteLogs(managedWriteState);
  await rebuildArchitectureGraph(cwd);
  console.log(`Initialized project architecture layout on ${currentDateISO()}`);
}
