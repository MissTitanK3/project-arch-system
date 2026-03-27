/**
 * Help topics content for pa help <topic>
 */

import { colors } from "../../utils/colors";
import { commandMetadata, listCommandMetadataKeys } from "../../sdk/commands";

function renderCommandMetadataRegistry(): string {
  const lines = ["Runtime Command Metadata Registry:"];

  for (const commandKey of listCommandMetadataKeys()) {
    const metadata = commandMetadata[commandKey];
    const inputs = metadata.inputs.length > 0 ? metadata.inputs.join(", ") : "(none)";
    lines.push(`  ${commandKey}`);
    lines.push(`    Description: ${metadata.description}`);
    lines.push(`    Inputs: ${inputs}`);
  }

  return lines.join("\n");
}

export const HELP_TOPICS = {
  commands: `Available Commands for AI Agents:

Initialization:
  pa init [options]                    Initialize new project architecture
    Options: --template, --pm, --with-ai, --with-workflows
    Output: Creates roadmap/, architecture/, arch-domains/ structure

Task Management:
  pa task new <phase> <milestone>      Create planned task (001-099 range)
    Output: Relative path to created task file
    
  pa task discover <phase> <milestone> --from <taskId>
                                       Create discovered task (101-199 range)
    Required: --from must be 3-digit ID of existing task
    Output: Relative path to created task file
    
  pa task idea <phase> <milestone>     Create backlog idea (901-999 range)
    Output: Relative path to created task file
    
  pa task status <phase> <milestone> <taskId>
                                       Get current status of a task
    Output: Status string (todo|in_progress|blocked|done)
    
  pa task lanes <phase> <milestone>    Show lane usage and next available IDs
    Output: Table with used/available IDs per lane
    Options: -v, --verbose (show all task IDs, not truncated)

Decision Management:
  pa decision new [options]            Create architecture decision record
    Options: --scope (project|phase|milestone), --phase, --milestone, --slug, --title
    Output: Decision ID and file path
    
  pa decision link <decisionId> [options]
                                       Link decision to tasks/code
    Options: --task, --code, --doc
    
  pa decision status <decisionId> <status>
                                       Update decision status
    Status: proposed|accepted|rejected|superseded
    
  pa decision supersede <decisionId> <supersededId>
                                       Mark one decision as superseding another
    
  pa decision list                     List all decisions
    Output: Decision ID, status per line
    
  pa decision migrate [--scan-only]    Migrate legacy decision files
    Output: Migration report with success/failure counts

Phase & Milestone:
  pa phase new <phaseId>               Create new phase
    Format: phaseId should match /^phase-\\d+$/
    
  pa phase list                        List all phases
    Output: Phase IDs with active marker (*)
    
  pa milestone new <phase> <milestoneId>
                                       Create new milestone within phase
    Format: milestoneId should match /^milestone-[\\w-]+$/
    
  pa milestone list                    List all milestones
    Output: Phase/milestone paths
    
  pa milestone activate <phase> <milestoneId>
                                       Activate milestone (requires readiness check)
    Output: Success message or readiness diagnostics
    
  pa milestone complete <phase> <milestoneId>
                                       Complete milestone (enforces governance)
    Output: Success message or governance diagnostics

Validation & Reporting:
  pa context [--json]                  Resolve active repository context
    Output: active phase + milestone + task + recommended action
    --json: Machine-readable context payload

  pa learn --path <path> [--json]      Interpret one or more explicit paths
    Output: path-scoped findings + suggested follow-up commands
    --json: Machine-readable learn report payload

  pa next [--json]                     Recommend next deterministic workflow action
    Output: status + recommended command + reason + evidence
    --json: Machine-readable routing decision payload

  pa check [--json]                    Validate architecture consistency
    Output: Validation errors and warnings
    --json: Machine-readable diagnostics with file paths

  pa check --file <path>               Validate only a specific file
    Output: Diagnostics filtered to the specified file

  pa check --milestone <id>            Validate only tasks in a milestone
    Output: Diagnostics filtered to tasks in that milestone ID

  pa explain <code>                    Print explanation and remediation for a diagnostic code
    Output: Human-readable description and step-by-step remediation
    Example: pa explain MALFORMED_TASK_FILE

  pa fix frontmatter [--yes]           Preview or apply safe frontmatter repairs
    Output: Dry-run diff by default; apply with --yes

  pa normalize [--yes]                 Preview or apply canonical frontmatter normalization
    Output: Dry-run diff by default; apply with --yes

  pa doctor                             Run holistic health sweep
    Order: pa lint frontmatter --fix -> pnpm lint:md -> pa check --json (all steps run)
    Output: Per-step issues + severity summary; exits 1 if any step failed

  pa doctor health [--repair] [--json]  Run structural health checks and optional safe repair
    --repair: Apply only repairable actions (directory/index/artifact recovery)
    --json: Machine-readable health payload with status, summary, and issue list

  pa lint frontmatter [--fix]          Preflight lint for YAML frontmatter
    Output: File+line diagnostics for tabs, missing keys, and schema/type issues
    --fix: Safe fixes for tabs, trailing whitespace, and risky plain scalars

  pa report [-v|--verbose]             Generate architecture report
    Output: Report text
    --verbose: Include detailed inconsistency diagnostics

Agent Skills:
  pa agents list [--json]             List resolved skill set
    Output: Stable skill list (human-readable or JSON)

  pa agents show <id> [--json]        Show one skill by id
    Output: Skill details (human-readable or JSON)

  pa agents new <id> [options]        Create a user skill scaffold
    Options: --title, --summary, --override, --tags, --json
    Output: Created skill path(s)

  pa agents sync [--check] [--json]   Sync or check derived registry status
    --check: Validate drift only, no write

  pa agents check [--json]            Run focused skill linter
    Output: OK/errors or diagnostics JSON

  pa help agents                      Explain skill manifests, overrides, and registry drift

Policy Analysis:
  pa policy check                      Detect policy conflicts (machine-readable JSON)
    Output: Deterministic conflict records with severity/confidence/claims/remediation

  pa policy explain                    Explain policy conflicts (human-readable)
    Output: Rationale and remediation guidance per conflict

Documentation:
  pa docs                              List all architecture docs
    Output: Category and file paths

Help System:
  pa help <topic>                      Get detailed help on a topic
    Topics: commands, agents, workflows, lanes, decisions, architecture, standards, validation, remediation, operations
    
  pa help topics                       List all available help topics

Output Formats:
  - Most commands print relative paths or simple status strings
  - Errors throw exceptions with descriptive messages
  - Use --help on any command for detailed usage

File Path Conventions:
  Tasks:      roadmap/phases/{phase}/milestones/{milestone}/tasks/{lane}/{id}-{slug}.md
  Decisions:  roadmap/decisions/{scope}/{id}-{slug}.md
  Phases:     roadmap/phases/{phase}/overview.md
  Milestones: roadmap/phases/{phase}/milestones/{milestone}/overview.md

Validation Patterns:
  Task ID:      ^\\d{3}$           (e.g., 001, 042, 999)
  Phase ID:     ^phase-\\d+$       (e.g., phase-1, phase-2)
  Milestone ID: ^milestone-[\\w-]+$ (e.g., milestone-1-setup)
  Decision ID:  ^\\d{3}$           (e.g., 001, 042)

${renderCommandMetadataRegistry()}
`,

  agents: `Agent Skills:

Purpose:
  Agent skills provide a deterministic capability layer under .arch/agents-of-arch/
  for repo-native guidance. They are documentation contracts, not executable plugins.

Directory Layout:
  .arch/agents-of-arch/
    skills/                Built-in skills scaffolded by pa init
    user-skills/           User-authored skills and explicit overrides
    user-skills/_template/ Reference template, ignored by the loader
    registry.json          Derived registry written by pa agents sync

Create a user skill:
  1. Scaffold the directory and required files:
     pa agents new architecture-audit --title "Architecture Audit"

  2. Edit the generated files:
     - skill.json      Manifest metadata and referenced files
     - system.md       Instructions for using the skill
     - checklist.md    Preconditions, execution steps, done criteria

  3. Validate and sync:
     pa agents sync --check
     pa agents sync
     pa agents check

Override semantics:
  - Built-in skills load first, sorted by skill id.
  - User skills load second, also sorted by skill id.
  - Final resolved output is sorted by skill id.
  - Reusing a built-in id requires overrides=true in the user skill manifest.
  - Duplicate ids without explicit override intent fail resolution.

Examples:
  pa agents list
  pa agents show repo-map
  pa agents new repo-map --override
  pa agents sync --check
  pa agents check --json

Registry behavior:
  - registry.json is derived from discovered skill manifests.
  - Do not edit registry.json directly.
  - pa agents sync --check exits non-zero when registry.json is stale.

Non-goals:
  - No executable skill runtime
  - No JavaScript/TypeScript plugin hooks
  - No plugin marketplace or remote code loading

Further reading:
  - packages/project-arch/docs/agents-skill-schema.md
`,

  workflows: `Common Workflows:

Feature Development Workflow:
  1. Create a phase for the feature area:
     pa phase new phase-1
     
  2. Create a milestone for the specific feature:
     pa milestone new phase-1 milestone-1-auth
     
  3. Create planned tasks for known work:
     pa task new phase-1 milestone-1-auth
     # Creates 001-{slug}.md in planned lane
     
  4. As you discover more work, create discovered tasks:
     pa task discover phase-1 milestone-1-auth --from 001
     # Creates 101-{slug}.md in discovered lane
     
  5. Capture future ideas in backlog:
     pa task idea phase-1 milestone-1-auth
     # Creates 901-{slug}.md in backlog lane

Task Status Management:
  1. Check current status:
     pa task status phase-1 milestone-1-auth 001
     
  2. Update task status by editing the markdown file:
     - Change 'status: todo' to 'status: in_progress'
     - Add notes in the task body
     
  3. View lane usage to track progress:
     pa task lanes phase-1 milestone-1-auth

Decision Recording:
  1. Create a project-wide decision:
     pa decision new --scope project --slug tech-stack --title "Technology Stack Selection"
     # Creates 001-tech-stack.md
     
  2. Link decision to relevant tasks:
     pa decision link 001 --task phase-1/milestone-1-auth/001
     
  3. Update decision status:
     pa decision status 001 accepted
     
  4. If a decision is superseded:
     pa decision supersede 002 001

Validation & Review:
  0. Ask the router for the next action:
    pa next

  1. Run frontmatter preflight lint:
    pa lint frontmatter --fix

  2. Run markdown lint:
    pnpm lint:md

  3. Check for consistency issues:
    pa check

  Shortcut: Run canonical preflight pipeline
    pa doctor
    # Equivalent to lint frontmatter --fix -> lint:md -> check --json

  Structural integrity sweep (safe repair mode):
    pa doctor health --repair

  4. Generate architecture report:
    pa report

  5. List all documentation:
     pa docs

  Custom Skill Authoring:
    1. Scaffold a new user skill:
      pa agents new release-readiness-custom --title "Release Readiness Custom"

    2. Update skill.json, system.md, and checklist.md with repo-specific guidance

    3. Check whether the registry is stale:
      pa agents sync --check

    4. Regenerate the derived registry when needed:
      pa agents sync

    5. Validate referenced files and structure:
      pa agents check
`,

  lanes: `Task Lanes Explained:

Task lanes organize work by discovery timing and priority:

Planned (001-099):
  - Tasks identified during upfront planning
  - Created with: pa task new
  - Use for: Well-defined work items, sprint planning
  - Example: "Implement user authentication"

Discovered (101-199):
  - Tasks found while working on planned tasks
  - Created with: pa task discover --from <taskId>
  - Use for: Technical debt, edge cases, refactoring needs
  - Example: "Add rate limiting to auth endpoint" (discovered while building auth)
  - Always linked to source task via --from flag

Backlog (901-999):
  - Future ideas, nice-to-haves, research topics
  - Created with: pa task idea
  - Use for: Feature requests, exploration, improvements
  - Example: "Research OAuth providers"

Lane Usage:
  - Each milestone has independent lane counters
  - View usage with: pa task lanes <phase> <milestone>
  - Maximum 99 tasks per lane per milestone
  
Best Practices:
  - Start with planned tasks for known work
  - Use discovered tasks for unexpected work found during execution
  - Keep backlog lean and periodically review
  - Link discovered tasks to their source for context
`,

  decisions: `Architecture Decisions:

Decision Scopes:
  
  Project:
    - Repository-wide decisions
    - Technology stack, frameworks, patterns
    - Created with: pa decision new --scope project
    - Location: roadmap/decisions/project/
    
  Phase:
    - Phase-specific architectural choices
    - Module structure, boundaries
    - Created with: pa decision new --scope phase --phase phase-1
    - Location: roadmap/decisions/phase-{id}/
    
  Milestone:
    - Milestone-specific implementation decisions
    - Component design, algorithm choice
    - Created with: pa decision new --scope milestone --phase phase-1 --milestone milestone-1-auth
    - Location: roadmap/decisions/milestone-{phase}-{milestone}/

Decision Lifecycle:
  1. proposed - Initial decision captured
  2. accepted - Team has agreed
  3. rejected - Decided not to proceed
  4. superseded - Replaced by newer decision

Linking Decisions:
  - Link to tasks: --task phase-1/milestone-1-auth/001
  - Link to code: --code src/auth/index.ts
  - Link to docs: --doc architecture/auth.md

Migration:
  - Scan legacy files: pa decision migrate --scan-only
  - Auto-migrate: pa decision migrate
  - Adds missing schema fields with defaults
`,

  architecture: `Architecture Management:

Repository Structure:
  roadmap/
    decisions/          Architecture decision records
    phases/            Development phases
      phase-{n}/
        overview.md    Phase documentation
        milestones/    Milestones within phase
          {milestone}/
            overview.md
            tasks/     Task files organized by lane
              planned/
              discovered/
              backlog/
  
  architecture/        Architecture documentation
    system.md         System overview
    module-model.md   Module structure
    
  arch-domains/       Domain boundaries
  arch-model/         Module metadata

Validation:
  The system validates:
  - Task ID uniqueness within milestone
  - Decision link targets exist
  - Phase and milestone structure
  - Frontmatter schema compliance
  
  Run: pa check

Reporting:
  Generate a comprehensive report:
  - Task distribution across lanes
  - Decision status summary
  - Milestone progress
  
  Run: pa report

Graph Operations:
  The architecture graph tracks:
  - Task dependencies
  - Decision links
  - Module boundaries
  
  See: .arch/graph.json
`,

  standards: `Project Architecture Standards:

File Naming:
  - Tasks: {id}-{slug}.md (e.g., 001-implement-auth.md)
  - Decisions: {id}-{slug}.md (e.g., 001-tech-stack.md)
  - Use lowercase, hyphens for spaces
  - IDs are always 3-digit zero-padded

Frontmatter Schema:
  Tasks require:
    - id: string (3-digit)
    - title: string
    - status: todo|in_progress|blocked|done
    - lane: planned|discovered|backlog
    - discoveredFromTask: (if lane is discovered)
    
  Decisions require:
    - id: string (3-digit)
    - title: string
    - status: proposed|accepted|rejected|superseded
    - scope: project|phase|milestone
    - schemaVersion: "1.0"

Content Structure:
  - Use markdown for all documentation
  - Include YAML frontmatter at top
  - Use ## for section headers
  - Link decisions with [[decision-id]]

Validation Patterns:
  - All IDs must be unique within scope
  - Decision links must reference existing items
  - Task lanes must match ID ranges
  - Status values must match enum
`,

  validation: `Architecture Validation:

Purpose:
  Validation commands help detect issues early before they cause runtime
  failures or break automated workflows. Use these commands to verify
  that tasks, decisions, and documentation meet all structural and schema requirements.

Validation Commands:

1. pa check
   Validates overall architecture integrity:
   - Task ID uniqueness within milestone
   - Decision link targets exist
   - Phase and milestone structure
   - Roadmap-graph parity
   - Schema compliance for all frontmatter
   - Cross-reference consistency
   
   Output: Human-readable errors and warnings
   Exit code: 1 if any errors, 0 if clean or warnings-only
   
   Options:
   --json    Output machine-readable diagnostics with file paths and line numbers

2. pa lint frontmatter [--fix]
   Preflight lint for YAML frontmatter issues:
   - Tab indentation (should use spaces)
   - Missing required keys by artifact type
   - Risky unquoted scalars (numbers, booleans, dates)
   - Invalid key types (non-string keys)
   - Schema type mismatches
   - YAML parse errors
   
   Output: File:line diagnostics with error codes
   Exit code: 1 if any errors, 0 if clean or warnings-only
   
   Options:
   --fix     Apply safe whitespace-only fixes (tabs→spaces)
             Does NOT rewrite scalar values to preserve meaning

3. pa policy check
   Detect policy conflicts in decision records:
   - Conflicting architectural choices
   - Incompatible patterns or technologies
   - Deprecated approach usage
   
   Output: Machine-readable JSON with conflict records
   Exit code: 1 if conflicts found, 0 if clean

4. pa policy explain
   Explain policy conflicts with human-readable guidance:
   - Rationale for each conflict
   - Remediation steps
   - Related decisions
   
   Output: Human-readable explanations
   Exit code: 1 if conflicts found, 0 if clean

Validation Workflow:

  Step 1: Preflight lint before committing
    pa lint frontmatter --fix
    # Fixes tabs automatically, flags other issues

  Step 2: Markdown lint
    pnpm lint:md
    # Verifies markdown formatting and structure rules

  Step 3: Full validation check
    pa check
    # Verifies all consistency rules

  Step 4: Policy conflict detection
    pa policy check
    # Checks for architectural conflicts

  Step 5: Generate report for review
    pa report -v
    # Comprehensive status summary

Common Issues and Solutions:

  Issue: "Missing required key 'status'"
  Solution: Add status field to task/decision frontmatter
  Command: pa lint frontmatter  # Shows exact file:line

  Issue: "Task ID already exists"
  Solution: Check lane usage before creating
  Command: pa task lanes <phase> <milestone>

  Issue: "Decision link target not found"
  Solution: Verify target task/file exists
  Command: pa decision list  # View all decisions

  Issue: "Tab indentation detected"
  Solution: Use spaces for YAML indentation
  Command: pa lint frontmatter --fix  # Auto-fixes

  Issue: "Graph out of sync with roadmap"
  Solution: Graph rebuilds automatically on next operation
  Command: pa check  # Validates sync

Best Practices:

  - Run 'pa lint frontmatter --fix' before every commit
  - Run 'pnpm lint:md' before 'pa check'
  - Use 'pa doctor' for canonical preflight when preparing closeout
  - Include 'pa check' in CI/CD pipeline
  - Check 'pa policy check' when adding new decisions
  - Use '--json' options for automated tooling
  - Fix errors before warnings for faster resolution

JSON Output Format:

  pa check --json outputs:
  {
    "ok": boolean,
    "errors": [...],
    "warnings": [...]
  }

  pa policy check outputs:
  {
    "ok": boolean,
    "conflicts": [
      {
        "id": string,
        "severity": "high"|"medium"|"low",
        "confidence": "high"|"medium"|"low",
        "summary": string,
        "relatedDecisions": string[],
        "claims": string[],
        "remediation": string
      }
    ]
  }
`,

  remediation: `Architecture Remediation:

Purpose:
  Remediation workflows help fix validation issues and restore architecture
  consistency. This guide provides step-by-step solutions for common problems.

Common Problems and Solutions:

1. Frontmatter YAML Issues

  Problem: Tab indentation in frontmatter
  Detection: pa lint frontmatter
  Fix: pa lint frontmatter --fix
  Manual: Replace tabs with 2 spaces in YAML section
  
  Problem: Missing required keys
  Detection: pa lint frontmatter (shows file:line and key name)
  Fix: Edit file and add required field with appropriate value
  Example frontmatter for tasks:
    ---
    schemaVersion: "1.0"
    id: "001"
    title: "Task title"
    status: "todo"
    lane: "planned"
    ---
  
  Problem: Unquoted numeric/boolean values
  Detection: pa lint frontmatter (SCALAR_SAFETY warnings)
  Fix: Add quotes around string values that look like numbers/booleans
  Before: id: 001
  After: id: "001"

2. Task Management Issues

  Problem: Task ID already exists
  Detection: Error when creating task
  Remediation:
    Step 1: Check existing tasks
      pa task lanes <phase> <milestone>
    Step 2: Use next available ID or different lane
    Step 3: Verify task in correct lane (planned/discovered/backlog)
  
  Problem: Discovered task missing --from reference
  Detection: Error during task creation or validation
  Remediation:
    Step 1: Identify source task ID
      pa task lanes <phase> <milestone>
    Step 2: Add discoveredFromTask field to frontmatter
    Or recreate: pa task discover <phase> <milestone> --from <taskId>

3. Decision Link Issues

  Problem: Decision link points to non-existent task
  Detection: pa check (broken link error)
  Remediation:
    Step 1: List all decisions
      pa decision list
    Step 2: Verify target task exists
      ls roadmap/phases/<phase>/milestones/<milestone>/tasks/
    Step 3: Update link or remove invalid reference
      pa decision link <id> --task <valid-ref>
  
  Problem: Decision scope mismatch
  Detection: Decision file in wrong directory
  Remediation:
    Step 1: Determine correct scope (project/phase/milestone)
    Step 2: Move file to correct directory
      roadmap/decisions/project/ for project scope
      roadmap/decisions/phase-{id}/ for phase scope
      roadmap/decisions/milestone-{phase}-{milestone}/ for milestone scope
    Step 3: Update frontmatter scope field

4. Phase and Milestone Issues

  Problem: Phase or milestone not found
  Detection: Error when creating tasks/milestones
  Remediation:
    Step 1: List existing phases
      pa phase list
    Step 2: Create missing phase
      pa phase new phase-1
    Step 3: Create milestone
      pa milestone new phase-1 milestone-1-setup
  
  Problem: Milestone structure incomplete
  Detection: pa check reports missing overview.md
  Remediation:
    Create milestone overview file at:
    roadmap/phases/<phase>/milestones/<milestone>/overview.md

5. Policy Conflicts

  Problem: Conflicting architectural decisions
  Detection: pa policy check
  Investigation: pa policy explain (shows details and rationale)
  Remediation:
    Step 1: Review related decisions
      pa policy explain  # Shows conflict details
    Step 2: Choose which decision is correct
    Step 3: Update or supersede conflicting decision
      pa decision status <id> rejected
      # OR
      pa decision supersede <new-id> <old-id>
    Step 4: Verify resolution
      pa policy check

6. Graph Sync Issues

  Problem: Graph out of sync with roadmap
  Detection: pa check reports parity warning
  Remediation:
    Graph rebuilds automatically on next operation
    Force rebuild by running any command:
      pa report  # Rebuilds graph
    Or wait for next task/decision operation

7. Schema Validation Failures

  Problem: Frontmatter doesn't match schema
  Detection: pa check or pa lint frontmatter
  Remediation:
    Step 1: View schema requirements
      pa help standards
    Step 2: Compare against your frontmatter
    Step 3: Add missing required fields
    Step 4: Fix field types (string vs number vs array)
    Step 5: Verify with lint
      pa lint frontmatter

Remediation Workflow:

  1. Identify Issues
     pa check --json > issues.json
     pa lint frontmatter > lint-issues.txt
     pa policy check > conflicts.json

  2. Triage by Severity
     - Fix errors before warnings
     - Fix frontmatter before structural issues
     - Fix broken links before policy conflicts

  3. Apply Fixes
     - Use pa lint frontmatter --fix for safe auto-fixes
     - Manually edit files for schema/content issues
     - Use pa commands to update links and status

  4. Verify Resolution
     pa lint frontmatter  # Should show no errors
     pa check             # Should show OK
     pa policy check      # Should show no conflicts

  5. Generate Clean Report
     pa report -v         # Verify everything is consistent

Automated Remediation:

  Safe auto-fixes (automated):
  - Tab indentation → spaces (pa lint frontmatter --fix)
  
  Manual fixes required:
  - Missing required keys (must choose appropriate values)
  - Invalid key types (must determine correct type)
  - Broken links (must identify correct targets)
  - Policy conflicts (must make architectural decisions)
  - Schema mismatches (must understand domain requirements)

Prevention Tips:

  - Use pa lint frontmatter --fix before committing
  - Create phases/milestones before tasks
  - Verify task lanes before creating tasks
  - Link decisions when creating them, not retroactively
  - Run pa check in CI pipeline to catch issues early
  - Use --help on commands to see valid options
  - Review pa help standards for schema requirements

Emergency Recovery:

  If architecture is severely broken:
  
  1. Backup current state
     cp -r roadmap roadmap.backup
  
  2. Run comprehensive diagnostics
     pa check --json > check-report.json
     pa lint frontmatter > lint-report.txt
  
  3. Fix files one by one, starting with:
     - Phases (pa phase list to verify)
     - Milestones (pa milestone list to verify)
     - Tasks (fix frontmatter first, then content)
     - Decisions (fix links last)
  
  4. Verify after each major fix
     pa check
  
  5. Generate final report
     pa report -v
`,

  operations: `Security & Operations Model:

Purpose:
  This topic documents observable CLI side effects: what is created or modified,
  whether network access occurs, subprocess usage, and where runtime config is read from.

File Creation and Managed Writes:

  pa init creates and manages repository architecture scaffolding, including:
    - roadmap/
    - architecture/
    - arch-domains/
    - arch-model/
    - .project-arch/ (tool state and configs)
    - .arch/agents-of-arch/ (skills and derived registry)

  Re-running pa init:
    - default: keeps existing conflicting managed files and reports them
    - --force: overwrites managed files

Commands That Create New Artifacts:

  - pa phase new
  - pa milestone new
  - pa task new / pa task discover / pa task idea
  - pa decision new
  - pa agents new
  - pa reconcile task (writes .project-arch/reconcile/*.json and *.md)

Commands That Modify Existing Artifacts:

  - pa decision link / status / supersede
  - pa task register-surfaces (unless --dry-run)
  - pa lint frontmatter --fix
  - pa fix frontmatter --yes
  - pa normalize --yes
  - pa policy setup (creates roadmap/policy.json if missing)
  - pa agents sync (writes registry unless --check)
  - pa reconcile prune --apply / pa reconcile compact --apply
  - pa feedback review / prune / export / rebuild / clear-derived / sync-from-reconcile

Automatic Feedback Capture:

  Failed CLI invocations can append observations under:
    .arch/feedback/observations/YYYY-MM-DD.jsonl
  This capture path is best-effort and never blocks command execution.

Network Behavior:

  Normal CLI execution is offline. The CLI does not perform hidden HTTP(S) requests.
  It operates on local repository files.

Subprocess Usage:

  Known subprocess calls in CLI code:
    - pa check --changed: runs git status --porcelain to infer changed paths
    - pa doctor: runs pnpm lint:md as the markdown-lint preflight step

Runtime Config Loading:

  - roadmap/policy.json
      Used for policy profile resolution (optional PA_POLICY_PROFILE env override)

  - .project-arch/graph.config.json
      Optional graph classification/suppression config

  - .project-arch/reconcile.config.json
      Optional reconciliation trigger tuning config

  - .project-arch/reconcile-config.json
      Legacy reconcile config filename accepted for compatibility
`,
};

export const TOPIC_LIST = Object.keys(HELP_TOPICS) as Array<keyof typeof HELP_TOPICS>;

export function getHelpTopic(topic: string): string | null {
  if (topic in HELP_TOPICS) {
    return HELP_TOPICS[topic as keyof typeof HELP_TOPICS];
  }
  return null;
}

function commandLine(command: string, description: string): string {
  return `  ${colors.command(command)} ${description}`;
}

function optionLine(option: string, description: string): string {
  return `    ${colors.option(option)} ${description}`;
}

function listCommands(): string {
  const separator = colors.separator("─".repeat(80));

  return `${colors.bold("Available Commands:")}

${separator}
${colors.heading("Project Setup:")}
${separator}
${commandLine("pa init [options]", "Initialize project architecture")}
${optionLine("--template <type>", "Template to use (default, minimal, full)")}
${optionLine("--pm <manager>", "Package manager (npm, yarn, pnpm)")}
${optionLine("--with-ai", "Include AI integration setup")}
${optionLine("--with-workflows", "Materialize first-pass workflow files")}

${separator}
${colors.heading("Phase Management:")}
${separator}
${commandLine("pa phase new <phaseId>", "Create new phase")}
${commandLine("pa phase list", "List all phases with active marker")}

${separator}
${colors.heading("Milestone Management:")}
${separator}
${commandLine("pa milestone new <phase> <milestone>", "Create new milestone")}
${commandLine("pa milestone list", "List all milestones")}
${commandLine("pa milestone activate <phase> <milestone>", "")}
                                       Activate milestone (requires readiness check)
${commandLine("pa milestone complete <phase> <milestone>", "")}
                                       Complete milestone (enforces governance)

${separator}
${colors.heading("Task Management:")}
${separator}
${commandLine("pa task new <phase> <milestone>", "Create planned task (001-099)")}
${optionLine("--title <text>", "Task title")}
${optionLine("--slug <slug>", "URL-friendly identifier")}
  
${commandLine("pa task discover <phase> <milestone>", "Create discovered task (101-199)")}
${optionLine("--from <taskId>", "Source task ID (required)")}
${optionLine("--title <text>", "Task title")}
${optionLine("--slug <slug>", "URL-friendly identifier")}
  
${commandLine("pa task idea <phase> <milestone>", "Create backlog task (901-999)")}
${optionLine("--title <text>", "Task title")}
${optionLine("--slug <slug>", "URL-friendly identifier")}
  
${commandLine("pa task status <phase> <milestone> <taskId>", "")}
                                       Get task status
  
${commandLine("pa task lanes <phase> <milestone>", "Show lane usage and capacity")}
${optionLine("--verbose, -v", "Show all task IDs (not truncated)")}

${separator}
${colors.heading("Decision Management:")}
${separator}
${commandLine("pa decision new [options]", "Create architecture decision")}
${optionLine("--scope <type>", "Scope: project, phase, or milestone")}
${optionLine("--phase <id>", "Phase ID (for phase/milestone scope)")}
${optionLine("--milestone <id>", "Milestone ID (for milestone scope)")}
${optionLine("--title <text>", "Decision title")}
${optionLine("--slug <slug>", "URL-friendly identifier")}
  
${commandLine("pa decision link <id> [options]", "Link decision to artifacts")}
${optionLine("--task <ref>", "Task reference")}
${optionLine("--code <path>", "Code file path")}
${optionLine("--doc <path>", "Documentation path")}
  
${commandLine("pa decision status <id> <status>", "")}
                                       Status: proposed, accepted, rejected, superseded
  
${commandLine("pa decision supersede <id> <supersededId>", "")}
                                       Mark decision as superseding another
  
${commandLine("pa decision list", "List all decisions")}
  
${commandLine("pa decision migrate [--scan-only]", "Migrate legacy decision files")}

${separator}
${colors.heading("Validation & Reporting:")}
${separator}
${commandLine("pa context [--json]", "Resolve active repository context")}
${commandLine("pa learn --path <path> [--json]", "Interpret path-scoped drift and suggest follow-up work")}
${commandLine("pa next [--json]", "Recommend next deterministic workflow action")}
${commandLine("pa check", "Validate architecture integrity")}
                                       - Task/decision consistency
                                       - Roadmap-graph parity
                                       - Schema compliance

${commandLine("pa doctor", "Run holistic preflight sweep (lint + check)")}
${commandLine("pa doctor health [--repair] [--json]", "Run structural health checks and optional safe repair")}
  
${commandLine("pa report [options]", "Generate architecture report")}
${optionLine("--verbose, -v", "Include detailed diagnostics")}

${separator}
${colors.heading("Agent Skills:")}
${separator}
${commandLine("pa agents list [--json]", "List resolved agent skills")}
${commandLine("pa agents show <id> [--json]", "Show one resolved skill")}
${commandLine("pa agents new <id> [options]", "Scaffold a user skill")}
${optionLine("--title <title>", "Optional display name")}
${optionLine("--summary <summary>", "Optional summary")}
${optionLine("--override", "Mark skill as override for a built-in id")}
${optionLine("--tags <tags>", "Comma-separated tags")}
${commandLine("pa agents sync [--check] [--json]", "Sync or check derived registry status")}
${commandLine("pa agents check [--json]", "Validate skill manifests and referenced files")}

${separator}
${colors.heading("Policy Analysis:")}
${separator}
${commandLine("pa policy check", "Detect policy conflicts (JSON output)")}
                                       Sets exit code 1 if conflicts found
  
${commandLine("pa policy explain", "Explain conflicts with remediation")}
                                       Sets exit code 1 if conflicts found

${separator}
${colors.heading("Documentation:")}
${separator}
${commandLine("pa docs", "List all architecture documentation")}

${separator}
${colors.heading("Help:")}
${separator}
${commandLine("pa help [topic]", "Show help for specific topic")}
${commandLine("pa help topics", "List all help topics")}

${separator}
${colors.heading("Global Options:")}
${separator}
  ${colors.option("--version")}                            Show version number
  ${colors.option("--help, -h")}                           Show command help

`;
}

export function listTopics(): string {
  const separator = colors.separator("─".repeat(80));

  return `${listCommands()}
${separator}
${colors.heading("Help Topics (detailed documentation):")}
${separator}

${TOPIC_LIST.map((topic) => `  ${colors.cyan(topic.padEnd(15))} ${colors.dim(getTopicDescription(topic))}`).join("\n")}

${colors.dim("Usage:")} 
  ${colors.command("pa help")} ${colors.dim("<topic>")}                      Show detailed topic documentation
  ${colors.command("pa <command>")} ${colors.option("--help")}                  Show command-specific help
`;
}

function getTopicDescription(topic: string): string {
  const descriptions: Record<string, string> = {
    commands: "Complete command reference for AI agents",
    agents: "Agent skill contracts, overrides, and registry workflow",
    workflows: "Common task and decision workflows",
    lanes: "Task lane system explained",
    decisions: "Architecture decision management",
    architecture: "Repository structure and validation",
    standards: "File naming and schema standards",
    validation: "Validation commands and workflows",
    remediation: "Fix common architecture issues",
    operations: "Security-facing operational behavior and side effects",
  };
  return descriptions[topic] || "";
}
