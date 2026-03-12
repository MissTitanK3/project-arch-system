import path from "path";
import fs from "fs-extra";
import {
  ensureDir,
  pathExists,
  writeJsonDeterministic,
  writeMarkdownWithFrontmatter,
} from "../../utils/fs";
import {
  milestoneDir,
  milestoneTaskLaneDir,
  phaseDecisionsRoot,
  phaseDir,
  projectDocsRoot,
} from "../../utils/paths";
import { currentDateISO } from "../../utils/date";
import {
  ensureDecisionIndex,
  rebuildArchitectureGraph,
  savePhaseManifest,
} from "../../core/manifests";
import { defaultPolicyFileDocument } from "../../core/governance/policy";
import { ObservationStore } from "../../feedback/observation-store";
import { IssueStore } from "../../feedback/issue-store";
import { defaultTaskFrontmatter } from "../../core/templates/task";
import { defaultArchitectureSpecTemplate } from "../../core/templates/architecture";
import { defaultConceptMapTemplate } from "../../core/templates/conceptMap";
import { defaultMilestoneGapClosureReportTemplate } from "../../core/templates/milestoneGapClosure";

function generateStandardsContent(fileName: string, title: string, description: string): string {
  const content = [`# ${title}`, "", description, ""];

  switch (fileName) {
    case "typescript-standards.md":
      content.push(
        "## Type Safety",
        "",
        "- Use strict TypeScript configuration (`strict: true`)",
        "- Avoid `any` type; use `unknown` or proper types",
        "- Define explicit return types for public functions",
        "- Use interface for object shapes, type for unions/primitives",
        "",
        "## Naming",
        "",
        "- PascalCase for types, interfaces, and classes",
        "- camelCase for functions and variables",
        "- UPPER_SNAKE_CASE for constants",
        "",
        "## Module Organization",
        "",
        "- Export types from dedicated `types.ts` files",
        "- Co-locate types with implementation when specific to one module",
        "- Use barrel exports (index.ts) for public package APIs",
        "",
      );
      break;

    case "markdown-standards.md":
      content.push(
        "## Formatting Rules",
        "",
        "All markdown files must pass markdownlint validation.",
        "",
        "### Required Rules",
        "",
        "- Use ATX-style headers (`#` syntax, not underlines)",
        "- Blank lines around headers, lists, and code blocks",
        "- No trailing spaces",
        "- Consistent list marker style (use `-` for unordered lists)",
        "- Fenced code blocks must specify language",
        "",
        "### Tables",
        "",
        "- Use consistent column alignment",
        "- Ensure pipes align with header row",
        "- Add blank line before and after table",
        "",
        "### Links",
        "",
        "- Use relative paths for internal links",
        "- Prefer reference-style links for repeated URLs",
        "",
        "## Linting",
        "",
        "Run `markdownlint` before committing:",
        "",
        "```bash",
        "pnpm lint:md",
        "```",
        "",
        "Canonical preflight order for architecture docs:",
        "",
        "1. `pa lint frontmatter --fix`",
        "2. `pnpm lint:md`",
        "3. `pa check` (or `pa doctor` for one-command preflight)",
        "",
        "For command details, use `pa help validation` and `pa help workflows`.",
        "",
      );
      break;

    case "testing-standards.md":
      content.push(
        "## Testing Strategy",
        "",
        "- Write unit tests for all business logic",
        "- Integration tests for API boundaries",
        "- E2E tests for critical user flows",
        "",
        "## Test Organization",
        "",
        "- Co-locate tests with source: `*.test.ts` next to `*.ts`",
        "- Use `describe` blocks to group related tests",
        "- Use `it` or `test` for individual test cases",
        "",
        "## Naming Conventions",
        "",
        "- Describe behavior, not implementation",
        "- Use `should` or present tense: `returns user data when authenticated`",
        "",
        "## Coverage",
        "",
        "- Target 80% code coverage minimum",
        "- 100% coverage for critical paths",
        "- Focus on behavior coverage, not just line coverage",
        "",
      );
      break;

    case "naming-conventions.md":
      content.push(
        "## Files and Directories",
        "",
        "- `kebab-case` for file names: `user-profile.tsx`",
        "- `PascalCase` for component files: `UserProfile.tsx`",
        "- `camelCase` for utility files: `formatDate.ts`",
        "",
        "## Components",
        "",
        "- `PascalCase` for React components: `Button`, `UserCard`",
        "- Suffix with type for specialized components: `UserForm`, `PostList`",
        "",
        "## Functions and Variables",
        "",
        "- `camelCase` for functions: `fetchUserData`, `calculateTotal`",
        "- `camelCase` for variables: `userName`, `isActive`",
        "- Boolean variables start with `is`, `has`, or `should`: `isLoading`, `hasAccess`",
        "",
        "## Constants",
        "",
        "- `UPPER_SNAKE_CASE` for true constants: `MAX_RETRIES`, `API_BASE_URL`",
        "- `camelCase` for configuration objects that may be mutated",
        "",
        "## Types and Interfaces",
        "",
        "- `PascalCase`: `User`, `ApiResponse`",
        "- Prefix interfaces with `I` only when necessary for disambiguation",
        "- Suffix types with purpose: `UserProps`, `AuthState`, `LoginPayload`",
        "",
      );
      break;

    case "turborepo-standards.md":
      content.push(
        "## Workspace Organization",
        "",
        "- `apps/`: User-facing applications",
        "- `packages/`: Shared libraries and infrastructure",
        "",
        "## Task Pipeline",
        "",
        "Define tasks in `turbo.json`:",
        "",
        "- `build`: Compile and bundle",
        "- `dev`: Development mode",
        "- `test`: Run test suites",
        "- `lint`: Code quality checks",
        "",
        "## Caching Strategy",
        "",
        "- Enable remote caching for CI/CD",
        "- Define `outputs` for all tasks that generate artifacts",
        "- Use `dependsOn` to declare task dependencies",
        "",
        "## Package Dependencies",
        "",
        "- Use workspace protocol: `workspace:*`",
        "- Internal packages should be in `dependencies`, not `devDependencies`",
        "- Keep external dependencies aligned across workspace when possible",
        "",
      );
      break;

    case "repo-structure.md":
      content.push(
        "## Directory Layout",
        "",
        "```text",
        "├── apps/                 # Applications",
        "│   ├── web/             # Main web app",
        "│   └── docs/            # Documentation site",
        "├── packages/            # Shared packages",
        "│   ├── ui/              # UI components",
        "│   ├── database/        # Database layer",
        "│   ├── api/             # API contracts",
        "│   └── types/           # Shared types",
        "├── architecture/        # Architecture docs",
        "├── arch-domains/        # Domain boundaries",
        "├── arch-model/          # Codebase topology",
        "└── roadmap/             # Execution state",
        "```",
        "",
        "## Placement Rules",
        "",
        "- User-facing code → `apps/`",
        "- Reusable logic → `packages/`",
        "- Architecture docs → `architecture/`",
        "- Execution tracking → `roadmap/`",
        "",
      );
      break;

    case "react-standards.md":
      content.push(
        "## Component Structure",
        "",
        "- Use functional components with hooks",
        "- Keep components focused and single-purpose",
        "- Extract custom hooks for reusable logic",
        "",
        "## State Management",
        "",
        "- Use `useState` for local component state",
        "- Use `useContext` for shared state within a subtree",
        "- Consider external state management for complex global state",
        "",
        "## Props",
        "",
        "- Define explicit prop types using TypeScript interfaces",
        "- Use destructuring in component signature",
        "- Provide default values when appropriate",
        "",
        "## File Organization",
        "",
        "```text",
        "ComponentName/",
        "  ├── ComponentName.tsx",
        "  ├── ComponentName.test.tsx",
        "  ├── ComponentName.module.css",
        "  └── index.ts",
        "```",
        "",
      );
      break;

    case "nextjs-standards.md":
      content.push(
        "## App Router",
        "",
        "- Use App Router (`app/` directory) for new features",
        "- Server Components by default, Client Components only when needed",
        "- Mark Client Components with `'use client'` directive",
        "",
        "## Data Fetching",
        "",
        "- Fetch data in Server Components when possible",
        "- Use `fetch` with Next.js caching extensions",
        "- Implement loading and error states using `loading.tsx` and `error.tsx`",
        "",
        "## Routing",
        "",
        "- Use file-based routing in `app/` directory",
        "- Dynamic routes: `[id]/page.tsx`",
        "- Route groups: `(group)/page.tsx` (no URL segment)",
        "",
        "## Performance",
        "",
        "- Use `next/image` for all images",
        "- Lazy load components when appropriate",
        "- Implement streaming with Suspense boundaries",
        "",
      );
      break;

    default:
      // Minimal content for any other standards file
      break;
  }

  // Join and trim to avoid trailing whitespace while ensuring single trailing newline
  return content.join("\n").trimEnd() + "\n";
}

export interface InitOptions {
  template?: string;
  apps?: string;
  pm?: string;
  withAi?: boolean;
  withDocsSite?: boolean;
}

interface PlannedBootstrapTask {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  dependsOn?: string[];
  completionCriteria: string[];
  objective: string;
  questions: string[];
  implementationPlan: string[];
  verification: string[];
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
    "## Runtime Surfaces",
    "",
    "User-facing functionality must be implemented in:",
    "",
    "- `apps/web`",
    "",
    "Documentation UI must be implemented in:",
    "",
    "- `apps/docs`",
    "",
    "---",
    "",
    "## Shared Modules",
    "",
    "Reusable logic must be implemented in `packages/`.",
    "",
    "- `packages/ui`: UI components and visual primitives.",
    "- `packages/types`: Shared types.",
    "- `packages/database`: Database access.",
    "- `packages/api`: API clients and server adapters.",
    "- `packages/config`: Shared configuration.",
    "",
    "---",
    "",
    "## Placement Rules",
    "",
    "1. UI components: `packages/ui`",
    "2. Shared types: `packages/types`",
    "3. Business logic: `packages/api` or domain packages",
    "4. Database logic: `packages/database`",
    "5. Application routing: `apps/web`",
    "6. Documentation content: `apps/docs`",
    "",
    "---",
    "",
    "## Forbidden Placement",
    "",
    "Agents must not:",
    "",
    "- implement reusable code inside `apps/`",
    "- place UI components inside `packages/api`",
    "- implement database logic inside `apps/`",
    "",
    "Reusable functionality must live in `packages/`.",
    "",
    "---",
    "",
    "## Example Task Mapping",
    "",
    "Example task:",
    "",
    "- `005-finalize-architecture-foundation.md`",
    "",
    "Expected changes:",
    "",
    "- `architecture/foundation/*`",
    "- `apps/docs/*`",
    "",
    "Example UI feature:",
    "",
    "- New dashboard component",
    "",
    "Expected implementation:",
    "",
    "- `packages/ui/components/dashboard`",
    "- `apps/web/app/dashboard`",
  ].join("\n");
}

function parseApps(value?: string): string[] {
  if (!value) {
    return ["web", "docs"];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

const bootstrapTasks: PlannedBootstrapTask[] = [
  {
    id: "001",
    slug: "define-project-overview",
    title: "Define project overview in architecture",
    tags: ["setup", "architecture", "overview"],
    completionCriteria: [
      "architecture/foundation/prompt.md is populated with project-specific setup prompt content.",
      "architecture/foundation/project-overview.md is completed with concrete, non-placeholder content.",
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
      "Paste the project setup prompt into architecture/foundation/prompt.md.",
      "Fill out architecture/foundation/project-overview.md with specific project context.",
      "Describe intended users and core user outcomes.",
      "Replace all placeholder content in overview sections with real answers derived from prompt.md.",
    ],
    verification: [
      "Confirm architecture/foundation/prompt.md does not include the PASTE_FOUNDATIONAL_PROMPT_HERE placeholder.",
      "Review architecture/foundation/project-overview.md and confirm no '...' placeholders remain.",
      "Confirm the project problem and user definition are explicit and testable.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "002",
    slug: "define-project-goals",
    title: "Define project goals in architecture",
    tags: ["setup", "architecture", "goals"],
    completionCriteria: [
      "architecture/foundation/goals.md includes measurable primary and secondary goals.",
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
      "Extract goal statements from architecture/foundation/prompt.md and convert them into concrete measurable statements in architecture/foundation/goals.md.",
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
    tags: ["setup", "architecture", "user-journey"],
    completionCriteria: [
      "architecture/foundation/user-journey.md captures end-to-end user flow steps.",
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
      "Extract user flow from architecture/foundation/prompt.md and fill architecture/foundation/user-journey.md with concrete journey steps.",
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
    tags: ["setup", "architecture", "scope"],
    completionCriteria: [
      "architecture/foundation/scope.md clearly defines in-scope and out-of-scope work.",
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
      "Derive explicit in-scope and out-of-scope boundaries from architecture/foundation/prompt.md and complete architecture/foundation/scope.md.",
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
    slug: "finalize-architecture-foundation",
    title: "Finalize architecture foundation readiness",
    tags: ["setup", "architecture"],
    dependsOn: ["001", "002", "003", "004", "006", "007", "008"],
    completionCriteria: [
      "All architecture/foundation documents are completed with project-specific content.",
      "Tasks 006, 007, and 008 are completed before this task is marked done.",
      "All architecture/architecture stub files have non-placeholder content.",
      "architecture documents are internally consistent across overview, goals, journey, and scope.",
      "Architecture/standards/reference and arch-domains doc areas include initial context for upcoming milestones.",
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
      "Review architecture/foundation/prompt.md and all derived foundation files for completeness and consistency.",
      "Add initial context files in architecture/architecture, standards, and reference where needed.",
      "Define initial domain boundaries in arch-domains with ownership and feature mapping.",
      "Resolve conflicts or ambiguities between foundational documents.",
      "Link future milestones to architecture as the required reference source.",
    ],
    verification: [
      "Confirm architecture/foundation has no placeholder lines left for required sections.",
      "Confirm architecture/architecture, standards, reference, and arch-domains each include initial documentation.",
      "Confirm system-boundaries.md, module-model.md, and runtime-architecture.md are non-placeholder and aligned with foundation docs.",
      "Confirm a new contributor can answer core project questions using architecture only.",
      "Run node packages/project-arch/dist/cli.js check and verify OK.",
    ],
  },
  {
    id: "006",
    slug: "define-system-boundaries",
    title: "Define system boundaries in architecture",
    tags: ["setup", "architecture", "system-boundaries", "discover", "greenfield"],
    completionCriteria: [
      "architecture/architecture/system-boundaries.md contains explicit domain ownership sections.",
      "Each domain boundary maps to at least one apps/ or packages/ module.",
      "Interaction constraints between domains are stated.",
      "If the project already has a codebase: boundaries are derived from observed module structure.",
      "If the project is greenfield: boundaries are derived from architecture/foundation docs.",
      "pa check passes after file is populated.",
    ],
    objective:
      "Establish canonical system boundary definitions so agents and contributors know which domain owns which module and what cross-domain interaction is explicitly permitted or forbidden.",
    questions: [
      "Does an existing application codebase already define implicit module or package boundaries?",
      "What are the top-level problem-space domains for this product?",
      "Which apps/ and packages/ directories map to each domain?",
      "What cross-domain interactions must be explicitly constrained?",
      "Are any domain boundaries ambiguous or overlapping?",
    ],
    implementationPlan: [
      "**Discover mode (existing codebase):**",
      "Inspect apps/, packages/, and arch-model files to identify existing module responsibilities.",
      "Group modules into problem-space domains derived from the current codebase and ownership hints.",
      "Write domain ownership and interaction rules in architecture/architecture/system-boundaries.md.",
      "**Define mode (greenfield):**",
      "Read architecture/foundation/prompt.md, project-overview.md, goals.md, and scope.md.",
      "Derive intended domains and map each to planned apps/ and packages/ modules.",
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
    id: "007",
    slug: "define-module-model",
    title: "Define module model in architecture",
    tags: ["setup", "architecture", "module-model", "discover", "greenfield"],
    completionCriteria: [
      "architecture/architecture/module-model.md describes each module responsibility and composition role.",
      "All modules listed in arch-model/modules.json appear in the document.",
      "Composition rules and dependency direction are stated.",
      "If codebase exists: module descriptions come from observed implementation.",
      "If greenfield: module descriptions are derived from foundation and arch-domains.",
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
      "Draft module-model.md with one section per module describing purpose and dependency rules.",
      "Reconcile gaps between arch-model data and observed module behavior.",
      "**Define mode (greenfield):**",
      "Read architecture/foundation docs and derive intended module responsibilities.",
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
    id: "008",
    slug: "define-runtime-architecture",
    title: "Define runtime architecture in architecture",
    tags: ["setup", "architecture", "runtime-architecture", "discover", "greenfield"],
    completionCriteria: [
      "architecture/architecture/runtime-architecture.md documents critical runtime paths.",
      "Deployment topology or runtime environment constraints are documented.",
      "At least one critical user-facing path is described end to end.",
      "If codebase exists: runtime paths are validated against observed routing and API structure.",
      "If greenfield: runtime architecture is derived from user journey and scope docs.",
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
      "Draft runtime-architecture.md with topology, critical paths, and constraints from observed behavior.",
      "**Define mode (greenfield):**",
      "Read architecture/foundation/user-journey.md and scope.md to derive required runtime flows.",
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
];

async function ensureDirIfMissing(cwd: string, relativeDir: string): Promise<void> {
  const target = path.join(cwd, relativeDir);
  if (!(await pathExists(target))) {
    await ensureDir(target);
  }
}

function renderTaskBody(task: PlannedBootstrapTask): string {
  const questionList = task.questions.map((question) => `- ${question}`);
  const implementationSteps = task.implementationPlan.map((step, index) => `${index + 1}. ${step}`);
  const verificationSteps = task.verification.map((step, index) => `${index + 1}. ${step}`);

  return [
    "## Objective",
    "",
    task.objective,
    "",
    "## Required Input",
    "",
    "- Use `architecture/foundation/prompt.md` as the canonical setup prompt source.",
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

export async function initializeProject(options: InitOptions, cwd = process.cwd()): Promise<void> {
  if (options.template !== "nextjs-turbo") {
    throw new Error(`Unsupported template '${options.template}'. Expected nextjs-turbo`);
  }
  if (options.pm !== "pnpm") {
    throw new Error(`Unsupported package manager '${options.pm}'. Expected pnpm`);
  }

  const apps = parseApps(options.apps);
  const fixedDirs = [
    "apps",
    "arch-model",
    "arch-domains",
    "packages/ui",
    "packages/types",
    "packages/config",
    "packages/database",
    "packages/api",
    "architecture/foundation",
    "architecture/architecture",
    "architecture/standards",
    "architecture/reference/examples",
    "architecture/reference/design-notes",
    "architecture/reference/experiments",
    "scripts",
  ];

  for (const dir of fixedDirs) {
    await ensureDirIfMissing(cwd, dir);
  }

  for (const app of apps) {
    await ensureDirIfMissing(cwd, path.join("apps", app));
  }

  if (options.withDocsSite !== false && !apps.includes("docs")) {
    await ensureDirIfMissing(cwd, path.join("apps", "docs"));
  }

  if (options.withAi) {
    await ensureDirIfMissing(cwd, path.join("ai", "indexing"));
  }

  const docsRoot = projectDocsRoot(cwd);
  await ensureDir(docsRoot);
  await ensureDir(path.join(docsRoot, "phases"));
  await ensureDir(path.join(docsRoot, "decisions"));
  await ensureDecisionIndex(path.join(docsRoot, "decisions"));

  const phaseId = "phase-1";
  const milestoneId = "milestone-1-setup";
  const now = currentDateISO();

  await savePhaseManifest(
    {
      schemaVersion: "1.0",
      phases: [{ id: phaseId, createdAt: now }],
      activePhase: phaseId,
      activeMilestone: milestoneId,
    },
    cwd,
  );

  await writeJsonDeterministic(path.join(docsRoot, "policy.json"), defaultPolicyFileDocument());

  const phasePath = phaseDir(phaseId, cwd);
  await ensureDir(path.join(phasePath, "milestones"));
  await ensureDir(phaseDecisionsRoot(phaseId, cwd));
  await ensureDecisionIndex(phaseDecisionsRoot(phaseId, cwd));

  await writeMarkdownWithFrontmatter(
    path.join(phasePath, "overview.md"),
    {
      schemaVersion: "1.0",
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
      "- Add the project setup prompt to architecture/foundation/prompt.md",
      "  as the canonical source.",
      "- Complete architecture/foundation with project overview, goals,",
      "  journey, and scope details derived from prompt.md.",
      "- Ensure agents can plan implementation from architecture",
      "  without missing context.",
      "",
    ].join("\n"),
  );

  const milestonePath = milestoneDir(phaseId, milestoneId, cwd);
  await ensureDir(milestoneTaskLaneDir(phaseId, milestoneId, "planned", cwd));
  await ensureDir(milestoneTaskLaneDir(phaseId, milestoneId, "discovered", cwd));
  await ensureDir(milestoneTaskLaneDir(phaseId, milestoneId, "backlog", cwd));
  await ensureDir(path.join(milestonePath, "decisions"));
  await ensureDecisionIndex(path.join(milestonePath, "decisions"));

  await writeJsonDeterministic(path.join(milestonePath, "manifest.json"), {
    schemaVersion: "1.0",
    id: milestoneId,
    phaseId,
    createdAt: now,
    updatedAt: now,
  });

  await writeMarkdownWithFrontmatter(
    path.join(milestonePath, "overview.md"),
    {
      schemaVersion: "1.0",
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
  );
  const targetsPath = path.join(milestonePath, "targets.md");
  if (!(await pathExists(targetsPath))) {
    await fs.writeFile(targetsPath, `${milestoneTargetsTemplate()}\n`, "utf8");
  }

  for (const task of bootstrapTasks) {
    const frontmatter = defaultTaskFrontmatter({
      id: task.id,
      slug: task.slug,
      title: task.title,
      lane: "planned",
      createdAt: now,
      discoveredFromTask: null,
    });

    frontmatter.tags = task.tags;
    frontmatter.completionCriteria = task.completionCriteria;
    if (task.dependsOn) {
      frontmatter.dependsOn = task.dependsOn;
    }

    await writeMarkdownWithFrontmatter(
      path.join(
        milestoneTaskLaneDir(phaseId, milestoneId, "planned", cwd),
        `${task.id}-${task.slug}.md`,
      ),
      frontmatter,
      renderTaskBody(task),
    );
  }

  const foundationDocs: Array<{ file: string; content: string[] }> = [
    {
      file: "prompt.md",
      content: [
        "# Setup Prompt",
        "",
        "Paste your foundational project prompt in this file.",
        "",
        "This is the canonical source used by `roadmap/phases/phase-1/milestones/milestone-1-setup/tasks/planned/*` to derive:",
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
        "Source: `architecture/foundation/prompt.md`",
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
        "Source: `architecture/foundation/prompt.md`",
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
        "Source: `architecture/foundation/prompt.md`",
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
        "Source: `architecture/foundation/prompt.md`",
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

  for (const doc of foundationDocs) {
    const docPath = path.join(cwd, "architecture", "foundation", doc.file);
    if (!(await pathExists(docPath))) {
      await fs.writeFile(docPath, `${doc.content.join("\n")}\n`, "utf8");
    }
  }

  const aiDocsReadmePath = path.join(cwd, "architecture", "README.md");
  if (!(await pathExists(aiDocsReadmePath))) {
    const aiDocsReadme = [
      "# AI Docs Table Of Contents",
      "",
      "This directory is the source of truth for agents and contributors. Use it to understand project intent, scope, architecture, and execution constraints.",
      "",
      "Read `system.md` first for the architecture entrypoint.",
      "Read `REPO_INDEX.md` second for the semantic model of the repository.",
      "Read `../arch-model/README.md` for machine-readable codebase topology.",
      "Read `../.arch/graph.json` for architecture traceability relationships.",
      "",
      "## Documentation Authority",
      "",
      "Use this authority order when docs conflict:",
      "",
      "1. `foundation/`",
      "2. `architecture/`",
      "3. `standards/`",
      "4. `reference/`",
      "",
      "`reference/` is informational only and must not override higher-authority docs.",
      "",
      "## Directory Map",
      "",
      "### foundation/",
      "",
      "Core product definition docs used before implementation begins.",
      "",
      "- [`prompt.md`](foundation/prompt.md): Canonical setup prompt used to derive foundation docs.",
      "- [`project-overview.md`](foundation/project-overview.md): What the project is, who it serves, and why it exists.",
      "- [`goals.md`](foundation/goals.md): Measurable primary and secondary outcomes.",
      "- [`user-journey.md`](foundation/user-journey.md): End-to-end user flow and critical scenarios.",
      "- [`scope.md`](foundation/scope.md): In-scope and out-of-scope boundaries.",
      "",
      "### architecture/",
      "",
      "Canonical system boundaries, module model, and runtime architecture.",
      "",
      "- [`system-boundaries.md`](architecture/system-boundaries.md): Domain boundaries, ownership, and interaction constraints.",
      "- [`module-model.md`](architecture/module-model.md): Module responsibilities and composition rules.",
      "- [`runtime-architecture.md`](architecture/runtime-architecture.md): Runtime flows, critical paths, and deployment constraints.",
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
      "### Other Files",
      "",
      "- [`templates-usage.md`](templates-usage.md): Guidance on when to use each template type (tasks, decisions, domains, etc.).",
      "- [`concept-map.json`](concept-map.json): Concept-to-artifact mapping for traceability.",
      "- `reference/`: Informational examples, design notes, and experiments (non-authoritative).",
      "- `../.arch/`: Machine-readable architecture traceability graph (tasks, decisions, modules, domains).",
      "",
      "## Agent Navigation Order",
      "",
      "1. Read `foundation/prompt.md` first.",
      "2. Read remaining `foundation/` docs to understand extracted intent and constraints.",
      "3. Read `architecture/` docs for canonical design constraints.",
      "4. **Read ALL `standards/` docs before proposing or implementing code.**",
      "5. Use `reference/` docs only for context and examples.",
      "6. Keep documentation updates synchronized with tasks and decisions in `roadmap/`.",
      "7. Verify `.arch/graph.json` reflects expected task/decision/module/domain links.",
    ].join("\n");
    await fs.writeFile(aiDocsReadmePath, `${aiDocsReadme}\n`, "utf8");
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
    await fs.writeFile(aiMapReadmePath, `${aiMapReadme}\n`, "utf8");
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
    await fs.writeFile(aiDomainsReadmePath, `${aiDomainsReadme}\n`, "utf8");
  }

  const domainsPath = path.join(cwd, "arch-domains", "domains.json");
  if (!(await pathExists(domainsPath))) {
    await writeJsonDeterministic(domainsPath, { domains: [] });
  }

  const domainTemplatePath = path.join(cwd, "arch-domains", "DOMAIN_TEMPLATE.md");
  if (!(await pathExists(domainTemplatePath))) {
    await fs.writeFile(
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
        "- `apps/<surface>`",
        "",
        "## Notes",
        "",
        "Additional context, assumptions, or constraints for this domain.",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  const architectureSpecTemplatePath = path.join(
    cwd,
    "architecture",
    "architecture",
    "ARCHITECTURE_SPEC_TEMPLATE.md",
  );
  if (!(await pathExists(architectureSpecTemplatePath))) {
    await fs.writeFile(architectureSpecTemplatePath, defaultArchitectureSpecTemplate(), "utf8");
  }

  const conceptMapPath = path.join(cwd, "architecture", "concept-map.json");
  if (!(await pathExists(conceptMapPath))) {
    await writeJsonDeterministic(conceptMapPath, defaultConceptMapTemplate());
  }

  const gapClosureTemplatePath = path.join(
    cwd,
    "architecture",
    "reference",
    "GAP_CLOSURE_REPORT_TEMPLATE.md",
  );
  if (!(await pathExists(gapClosureTemplatePath))) {
    await fs.writeFile(gapClosureTemplatePath, defaultMilestoneGapClosureReportTemplate(), "utf8");
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
      "**Template location**: `architecture/architecture/ARCHITECTURE_SPEC_TEMPLATE.md`",
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
      "**Template location**: `architecture/reference/GAP_CLOSURE_REPORT_TEMPLATE.md`",
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
    await fs.writeFile(templatesReadmePath, templatesUsageGuide, "utf8");
  }

  const appRoot = path.join(cwd, "apps");
  const packageRoot = path.join(cwd, "packages");
  const appEntries = await fs.readdir(appRoot, { withFileTypes: true });
  const packageEntries = await fs.readdir(packageRoot, { withFileTypes: true });
  const appModules = appEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `apps/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));
  const packageModules = packageEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));

  const moduleDescriptions: Record<string, string> = {
    "apps/web": "Primary user-facing application.",
    "apps/docs": "Documentation application.",
    "packages/ui": "Reusable UI components.",
    "packages/types": "Shared type definitions.",
    "packages/config": "Shared runtime and tooling configuration.",
    "packages/database": "Database schema and access layer.",
    "packages/api": "Shared API contracts and service logic.",
    "packages/eslint-config": "Shared linting configuration.",
    "packages/typescript-config": "Shared TypeScript configuration presets.",
  };

  const modules = [...appModules, ...packageModules].map((moduleName) => ({
    name: moduleName,
    type: moduleName.startsWith("apps/")
      ? ("application" as const)
      : moduleName === "packages/database"
        ? ("infrastructure" as const)
        : ("library" as const),
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
  for (const moduleName of [...appModules, ...packageModules]) {
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
        from: "apps",
        canDependOn: ["packages"],
      },
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
      "- Foundation: Why the system exists. Location: `architecture/foundation`.",
      "- Architecture: How the system works. Location: `architecture/architecture`, `architecture/standards`.",
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
      "foundation/",
      "project intent, goals, scope, user journey",
      "",
      "architecture/",
      "canonical system architecture and design principles",
      "",
      "standards/",
      "binding implementation and repository standards",
      "",
      "reference/",
      "informational examples, design notes, and experiments",
      "",
      "Agents must treat this directory as the primary source of truth for system intent.",
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
      "### apps/",
      "",
      "User-facing applications.",
      "",
      "Examples:",
      "",
      "apps/web",
      "apps/docs",
      "",
      "Agents should treat these directories as runtime surfaces, not architecture definition locations.",
      "",
      "---",
      "",
      "### packages/",
      "",
      "Shared infrastructure and modules.",
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
      "architecture/foundation",
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
      "1. `architecture/foundation`",
      "2. `architecture/architecture`",
      "3. `architecture/standards`",
      "4. `arch-domains`",
      "5. `roadmap/decisions`",
      "6. `roadmap/phases`",
      "7. `architecture/reference` (informational only)",
      "8. runtime code",
      "",
      "Higher layers override lower layers.",
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
    await fs.writeFile(repoIndexPath, `${repoIndex}\n`, "utf8");
  }

  const areaReadmes: Array<{ area: string; fileName: string; title: string; description: string }> =
    [
      {
        area: "architecture",
        fileName: "system-boundaries.md",
        title: "System Boundaries",
        description: "Define canonical domain boundaries, ownership, and interaction constraints.",
      },
      {
        area: "architecture",
        fileName: "module-model.md",
        title: "Module Model",
        description:
          "Define module responsibilities and composition rules across apps and packages.",
      },
      {
        area: "architecture",
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
      } else {
        content = [`# ${readme.title}`, "", readme.description, ""].join("\n");
      }

      await fs.writeFile(readmePath, content, "utf8");
    }
  }

  const repoModelPath = path.join(cwd, "architecture", "architecture", "REPO-MODEL.md");
  if (!(await pathExists(repoModelPath))) {
    const repoModel = [
      "# Repository Mental Model",
      "",
      "This repository uses a four-layer model to keep planning, architecture, execution, and code aligned.",
      "",
      "## 1. Foundation",
      "",
      "Location: `architecture/foundation/`",
      "",
      "Purpose: Define why the system exists, who it serves, what success looks like, and what is in/out of scope.",
      "",
      "## 2. Architecture",
      "",
      "Location: `architecture/architecture/`, `architecture/standards/`",
      "",
      "Purpose: Define how the system should be built, constrained, and maintained.",
      "",
      "## 3. Execution",
      "",
      "Location: `roadmap/phases/`, `roadmap/decisions/`",
      "",
      "Purpose: Track what is being built now through phases, milestones, tasks, and decisions.",
      "",
      "## 4. Runtime",
      "",
      "Location: `apps/`, `packages/`",
      "",
      "Purpose: Hold the actual implementation artifacts that deliver behavior.",
      "",
      "## Agent Rule",
      "",
      "When making changes, keep all four layers synchronized. Do not change runtime behavior without updating execution and architecture context as needed.",
    ].join("\n");
    await fs.writeFile(repoModelPath, `${repoModel}\n`, "utf8");
  }

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
      "1. `foundation/`",
      "2. `architecture/`",
      "3. `standards/`",
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
    await fs.writeFile(architectureSystemPath, `${architectureSystem}\n`, "utf8");
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
    const content = ["packages:", "  - apps/*", "  - packages/*", ""].join("\n");
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

  const agentsDocPath = path.join(cwd, "agents.md");
  if (!(await pathExists(agentsDocPath))) {
    const agentsDoc = [
      "# Agents Guide",
      "",
      "This file is the root entry point for LLMs and autonomous agents operating in this repository.",
      "",
      "Agents must follow the read order and operating rules defined below before making any repository changes.",
      "",
      "---",
      "",
      "## 1. Read Order",
      "",
      "Agents must read documentation in the following order before executing work.",
      "",
      "1. `architecture/system.md`",
      "   - Single entrypoint that summarizes architecture, domains, model, and roadmap context.",
      "",
      "2. `architecture/REPO_INDEX.md`",
      "   - Repository architecture model and authority hierarchy.",
      "",
      "3. `arch-model/README.md`",
      "   - Machine-readable codebase topology and module navigation.",
      "",
      "4. `.arch/graph.json`",
      "   - Machine-readable architecture traceability graph.",
      "",
      "5. `architecture/README.md`",
      "   - Documentation structure and navigation.",
      "",
      "6. `arch-domains/README.md`",
      "   - Domain boundaries and ownership map.",
      "",
      "7. `architecture/foundation/*`",
      "   - Project goals",
      "   - product intent",
      "   - user journey",
      "   - scope boundaries",
      "",
      "8. `architecture/architecture/*`",
      "   - canonical system boundaries and architecture decisions",
      "",
      "9. **`architecture/standards/*` (REQUIRED before implementation)**",
      "   - **ALL standards must be reviewed before writing code**",
      "   - Implementation and repository standards",
      "   - TypeScript, React, Next.js, Markdown, Testing conventions",
      "   - Naming patterns and Turborepo organization",
      "",
      "10. `roadmap/phases/*`",
      "   - Current development phase",
      "   - milestones",
      "   - active tasks",
      "",
      "11. `roadmap/decisions/*`",
      "   - architectural decisions that constrain implementation",
      "",
      "12. `roadmap/phases/{phase}/milestones/{milestone}/targets.md`",
      "   - Canonical implementation targets for task placement.",
      "",
      "13. `architecture/reference/*` (optional)",
      "   - Informational context only; non-authoritative.",
      "",
      "14. `architecture/templates-usage.md`",
      "   - Guidance on when to use each template type.",
      "",
      "15. Relevant topic directories depending on the task.",
      "",
      "Agents must not begin implementation before completing this read order.",
      "",
      "---",
      "",
      "## 2. Topic Map",
      "",
      "### Product Intent",
      "",
      "architecture/foundation/",
      "",
      "Defines product goals, scope, and user journey.",
      "",
      "---",
      "",
      "### Architecture",
      "",
      "architecture/architecture/",
      "",
      "Defines canonical system structure, domain boundaries, and major architectural decisions.",
      "",
      "---",
      "",
      "### Standards",
      "",
      "architecture/standards/",
      "",
      "Defines binding implementation and repository standards.",
      "",
      "**Critical: Agents must review ALL standards files before implementing ANY code.**",
      "",
      "Required standards files:",
      "",
      "- `repo-structure.md`",
      "- `react-standards.md`",
      "- `nextjs-standards.md`",
      "- `typescript-standards.md`",
      "- `markdown-standards.md`",
      "- `testing-standards.md`",
      "- `naming-conventions.md`",
      "- `turborepo-standards.md`",
      "",
      "---",
      "",
      "### Domains",
      "",
      "arch-domains/",
      "",
      "Defines business-domain ownership boundaries and problem-space mapping.",
      "",
      "---",
      "",
      "### Reference",
      "",
      "architecture/reference/",
      "",
      "Informational examples, notes, and experiments only.",
      "",
      "---",
      "",
      "### Execution Plan",
      "",
      "roadmap/phases/",
      "roadmap/decisions/",
      "",
      "Active development phases, milestones, tasks, and decision records.",
      "",
      "---",
      "",
      "### Runtime Applications",
      "",
      "apps/",
      "",
      "---",
      "",
      "### Shared Packages",
      "",
      "packages/",
      "",
      "---",
      "",
      "### AI Map",
      "",
      "arch-model/",
      "",
      "Machine-readable module boundaries, entrypoints, dependencies, ownership, and surfaces.",
      "",
      "---",
      "",
      "### Architecture Graph",
      "",
      ".arch/",
      "",
      "Machine-readable graph linking domains, decisions, milestones, tasks, and modules.",
      "",
      "---",
      "",
      "## 3. Agent Execution Workflow",
      "",
      "Agents must follow this workflow when performing work.",
      "",
      "### Step 1 - Understand Context",
      "",
      "Read:",
      "",
      "architecture/foundation/",
      "architecture/architecture/",
      "**architecture/standards/** (ALL files required)",
      "arch-domains/",
      "roadmap/phases/",
      "",
      "Confirm:",
      "",
      "- project goals",
      "- current milestone",
      "- active tasks",
      "- **ALL standards docs have been reviewed**",
      "",
      "**Standards Review Checklist:**",
      "",
      "Before writing ANY code, verify you have read:",
      "",
      "- [ ] `repo-structure.md`",
      "- [ ] `typescript-standards.md`",
      "- [ ] `react-standards.md`",
      "- [ ] `nextjs-standards.md`",
      "- [ ] `markdown-standards.md`",
      "- [ ] `testing-standards.md`",
      "- [ ] `naming-conventions.md`",
      "- [ ] `turborepo-standards.md`",
      "",
      "---",
      "",
      "### Step 2 - Select Work Item",
      "",
      "Agents must only execute work defined in:",
      "",
      "roadmap/phases/{phase}/milestones/{milestone}/tasks/",
      "roadmap/phases/{phase}/milestones/{milestone}/targets.md",
      "",
      "Task lanes:",
      "",
      "planned/",
      "discovered/",
      "backlog/",
      "",
      "Rules:",
      "",
      "- Prefer tasks in `planned/`",
      "- `discovered/` tasks must be documented before execution",
      "- `backlog/` tasks are not part of the active milestone",
      "",
      "Operational references:",
      "- Planned lane creation: `pa task new {phase} {milestone}`",
      "- Discovered lane creation: `pa task discover {phase} {milestone} --from <taskId>`",
      "- Backlog lane creation: `pa task idea {phase} {milestone}`",
      "- Lane guidance: `pa help lanes`",
      "",
      "---",
      "",
      "### Step 3 - Implement Work",
      "",
      "Implementation must occur in:",
      "",
      "apps/",
      "packages/",
      "",
      "Agents must follow:",
      "",
      "architecture/standards/*",
      "",
      "---",
      "",
      "### Step 4 - Maintain Traceability",
      "",
      "When changes occur, agents must update:",
      "",
      "- Task file: progress or completion.",
      "- Decision logs: architecture changes.",
      "- Documentation: new features or behavior.",
      "",
      "Traceability must exist between:",
      "",
      "Task",
      "Decision",
      "Code",
      "Documentation",
      "",
      "Operational references:",
      "- Workflow guidance: `pa help workflows`",
      "- Validation guidance: `pa help validation`",
      "- Canonical preflight: `pa doctor`",
      "- Feedback queue and triage: `pa feedback list`, `pa feedback show <issueId>`, `pa feedback review <issueId> [--dismiss|--mitigated-locally|--defer|--escalate] [--yes]` (see `pa feedback --help`)",
      "",
      "**Milestone Completion**: When all tasks in a milestone reach 'done' status, ",
      "create a Gap Closure Report using `architecture/reference/GAP_CLOSURE_REPORT_TEMPLATE.md`.",
      "",
      "---",
      "",
      "## 4. Operating Rules",
      "",
      "Agents must follow these constraints.",
      "",
      "### Source of Truth",
      "",
      "- `architecture/`: project meaning and constraints.",
      "- `roadmap/`: execution plan and delivery state.",
      "- `apps/`: runtime application code.",
      "- `packages/`: shared infrastructure.",
      "",
      "---",
      "",
      "### Documentation Authority",
      "",
      "Documentation is hierarchical. Resolve conflicts using this order:",
      "",
      "1. `architecture/foundation`",
      "2. `architecture/architecture`",
      "3. `architecture/standards`",
      "4. `arch-domains`",
      "5. `roadmap/decisions`",
      "6. `roadmap/phases`",
      "7. `architecture/reference`",
      "",
      "`architecture/reference` is informational only and must not override architecture or standards.",
      "",
      "For operational command discovery, use `pa help workflows`, `pa help validation`, and `pa help lanes`.",
      "",
      "---",
      "",
      "### Concept Creation Rule",
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
      "If a required concept does not exist, the agent must:",
      "",
      "1. create a decision proposal",
      "2. document the concept",
      "3. wait for approval before implementation",
      "",
      "---",
      "",
      "### Documentation Discipline",
      "",
      "Agents must:",
      "",
      "- keep architecture decisions documented",
      "- keep tasks synchronized with implementation",
      "- avoid undocumented architectural changes",
      "",
      "---",
      "",
      "### Artifact Creation",
      "",
      "Agents must not create new structure arbitrarily.",
      "",
      "New artifacts should be created using CLI tooling when available.",
      "",
      "Example:",
      "",
      "pa task new {phase} {milestone}",
      "pa decision new",
      "",
      "**Template Usage Rules**:",
      "",
      "- Tasks: Create per work item using CLI",
      "- Decisions: Create only when architectural choice is required",
      "- Domain Specs: Create 1-5 times per phase for new domains only",
      "- Architecture Specs: Create 2-8 times per project for major components",
      "- Concept Maps: Update once per milestone during planning",
      "- Gap Closure Reports: Create ONLY when all milestone tasks are done",
      "",
      "See `architecture/templates-usage.md` for detailed guidance.",
      "",
      "---",
      "",
      "### Safety Rules",
      "",
      "Agents must NOT:",
      "",
      "- invent architecture not aligned with `architecture`",
      "- skip tasks in the execution plan",
      "- modify milestone structure without explicit direction",
      "- introduce undocumented dependencies",
      "- delete decision history",
      "",
      "---",
      "",
      "## 5. Agent Philosophy",
      "",
      "This repository follows a repo-native architecture system.",
      "",
      "All knowledge required to build the system exists inside the repository.",
      "",
      "Agents should prioritize:",
      "",
      "1. traceability",
      "2. deterministic structure",
      "3. documentation alignment",
      "4. minimal architectural drift",
      "",
      "---",
      "",
      "## 6. Operational Command Reference",
      "",
      "This appendix provides command-level operational guidance and does not change documentation authority or governance rules above.",
      "",
      "### Workflow & Preflight",
      "",
      "- `pa help workflows`",
      "- `pa help validation`",
      "- `pa doctor`",
      "",
      "### Task Lane Commands",
      "",
      "- `pa task new {phase} {milestone}`",
      "- `pa task discover {phase} {milestone} --from <taskId>`",
      "- `pa task idea {phase} {milestone}`",
      "- `pa help lanes`",
      "",
      "### Feedback Operations",
      "",
      "- `pa feedback list`",
      "- `pa feedback show <issueId>`",
      "- `pa feedback review <issueId> [--dismiss|--mitigated-locally|--defer|--escalate] [--yes]`",
      "- `pa feedback export <issueId> [--format md|json]`",
      "- `pa feedback refresh`",
      "- `pa feedback rebuild`",
      "- `pa feedback prune [--dry-run]`",
      "",
    ].join("\n");
    await fs.writeFile(agentsDocPath, `${agentsDoc}\n`, "utf8");
  }

  // Initialize feedback system stores
  const archDir = path.join(cwd, ".arch");
  const observationStore = new ObservationStore(archDir);
  const issueStore = new IssueStore(archDir);
  await observationStore.initialize();
  await issueStore.initialize();

  await rebuildArchitectureGraph(cwd);
  console.log(`Initialized project architecture layout on ${currentDateISO()}`);
}
