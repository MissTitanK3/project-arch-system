export function generateStandardsContent(
  fileName: string,
  title: string,
  description: string,
): string {
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
        "- `packages/`: Runtime modules, shared libraries, and infrastructure",
        "- `architecture/`: Canonical architecture and governance documentation",
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
        "├── packages/            # Runtime modules and shared packages",
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
        "- Runtime code and reusable logic → `packages/`",
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
      break;
  }

  return content.join("\n").trimEnd() + "\n";
}

export function generateArchitectureFamilyReadme(
  area: string,
  title: string,
  description: string,
): string {
  const content = [`# ${title}`, "", description, ""];

  switch (area) {
    case "product-framing":
      content.push(
        "## Belongs Here",
        "",
        "- project goals and success criteria",
        "- core concepts and product meaning",
        "- scope framing and non-scope",
        "- user journey framing",
        "- risk framing and major assumptions",
        "",
        "## Does Not Belong Here",
        "",
        "- subsystem behavior detail that belongs in `systems/`",
        "- runtime topology or deployment constraints that belong in `runtime/`",
        "- implementation rules that belong in `standards/`",
        "",
        "## Boundary Notes",
        "",
        "- Use `product-framing/` for why the system exists and what it must achieve.",
        "- Use `systems/` for how major capabilities behave.",
        "",
      );
      break;
    case "systems":
      content.push(
        "## Belongs Here",
        "",
        "- major system definitions",
        "- user-facing workflows and system flows",
        "- subsystem interaction models",
        "- capability-level behavior design",
        "",
        "## Does Not Belong Here",
        "",
        "- runtime topology, scheduling, or deployment constraints that belong in `runtime/`",
        "- persistence schemas or recovery models that belong in `data/`",
        "- content authoring formats that belong in `content/`",
        "",
        "## Boundary Notes",
        "",
        "- Use `systems/` for what the system does and how major parts interact.",
        "- Use `runtime/` for where and how those systems execute.",
        "- Use `content/` when the document is about authoring/configuration formats rather than runtime behavior.",
        "",
      );
      break;
    case "data":
      content.push(
        "## Belongs Here",
        "",
        "- state models",
        "- schemas and entity definitions",
        "- persistence boundaries",
        "- save, archival, and recovery models",
        "",
        "## Does Not Belong Here",
        "",
        "- execution topology and runtime scheduling that belong in `runtime/`",
        "- workflow behavior definitions that belong in `systems/`",
        "",
        "## Boundary Notes",
        "",
        "- Use `data/` for what is stored, tracked, versioned, or recovered.",
        "- Use `runtime/` for how execution happens over time or across runtime surfaces.",
        "",
      );
      break;
    case "runtime":
      content.push(
        "## Belongs Here",
        "",
        "- runtime topology and surface boundaries",
        "- scheduling and execution flow",
        "- deployment or environment runtime constraints",
        "- critical path and latency-sensitive runtime behavior",
        "",
        "## Does Not Belong Here",
        "",
        "- user-facing workflow definitions that belong in `systems/`",
        "- data schemas or persistence ownership that belong in `data/`",
        "",
        "## Boundary Notes",
        "",
        "- Use `runtime/` for where and how the system executes.",
        "- Use `systems/` for what the user-facing or subsystem behavior is.",
        "- Use `data/` for what state exists and how it is persisted.",
        "",
      );
      break;
    case "content":
      content.push(
        "## Belongs Here",
        "",
        "- content authoring formats",
        "- configuration authoring workflows",
        "- content directory structures",
        "- editorial or authored-content lifecycle guidance",
        "",
        "## Does Not Belong Here",
        "",
        "- subsystem behavior specifications that belong in `systems/`",
        "- runtime constraints that belong in `runtime/`",
        "",
        "## Boundary Notes",
        "",
        "- Use `content/` when the document is about authored or configured artifacts and how they are structured.",
        "- Use `systems/` when the document is about runtime or user-facing behavior rather than the authoring model.",
        "",
      );
      break;
    case "governance":
      content.push(
        "## Belongs Here",
        "",
        "- repository model and authority rules",
        "- ownership guidance",
        "- module or package governance",
        "- architecture control and decision-making rules",
        "",
        "## Does Not Belong Here",
        "",
        "- binding implementation rules that belong in `standards/`",
        "- operational runbooks that belong in `operations/`",
        "",
        "## Boundary Notes",
        "",
        "- Use `governance/` for who owns decisions, how authority works, and how architectural control is maintained.",
        "- Use `standards/` for rules contributors must follow while implementing.",
        "- Use `operations/` for procedures used to run, recover, or secure the system.",
        "",
      );
      break;
    case "operations":
      content.push(
        "## Belongs Here",
        "",
        "- deployment runbooks",
        "- recovery and backup guidance",
        "- privacy and security operations procedures",
        "- operational response procedures",
        "",
        "## Does Not Belong Here",
        "",
        "- architecture authority rules that belong in `governance/`",
        "- engineering standards that belong in `standards/`",
        "",
        "## Boundary Notes",
        "",
        "- Use `operations/` for how the system is operated, recovered, or secured in practice.",
        "- Use `governance/` for ownership, control, and policy-level architecture guidance.",
        "",
      );
      break;
    case "templates":
      content.push(
        "## Belongs Here",
        "",
        "- canonical architecture document templates",
        "- reusable architecture document scaffolds",
        "",
        "## Does Not Belong Here",
        "",
        "- architecture guidance that belongs in another family",
        "- active project-specific specifications that should live in the appropriate family",
        "",
        "## Boundary Notes",
        "",
        "- Use `templates/` for reusable scaffolding, not for the authoritative project document itself.",
        "",
      );
      break;
    case "foundation":
      content.push(
        "## Belongs Here",
        "",
        "- legacy product framing documents that have not yet been migrated",
        "- historical setup prompts and older framing notes kept only for transition support",
        "",
        "## Does Not Belong Here",
        "",
        "- new authoritative framing documents that belong in `product-framing/`",
        "- system, runtime, or data design documents that belong in canonical families",
        "",
        "## Boundary Notes",
        "",
        "- Treat `foundation/` as transitional support only.",
        "- Move active goals, scope, risk, and concept documents into `product-framing/`.",
        "",
      );
      break;
    case "legacy-architecture":
      content.push(
        "## Belongs Here",
        "",
        "- legacy architecture behavior documents that have not yet been re-homed",
        "- historical system/runtime/governance documents retained only during migration",
        "",
        "## Does Not Belong Here",
        "",
        "- new authoritative system design that belongs in `systems/`",
        "- runtime topology that belongs in `runtime/`",
        "- module and ownership rules that belong in `governance/`",
        "",
        "## Boundary Notes",
        "",
        "- Treat `legacy-architecture/` as transitional support only.",
        "- Move active authoritative documents into `systems/`, `runtime/`, `data/`, or `governance/` based on role.",
        "",
      );
      break;
    default:
      content.push(
        "## Belongs Here",
        "",
        "- documents that match this family's stated role",
        "",
        "## Does Not Belong Here",
        "",
        "- documents whose primary purpose belongs to another architecture family",
        "",
      );
      break;
  }

  return content.join("\n").trimEnd() + "\n";
}
