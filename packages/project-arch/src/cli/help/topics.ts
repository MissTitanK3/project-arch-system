/**
 * Help topics content for pa help <topic>
 */

export const HELP_TOPICS = {
  commands: `Available Commands for AI Agents:

Initialization:
  pa init [options]                    Initialize new project architecture
    Options: --template, --pm, --apps, --with-ai, --with-docs-site
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
    Output: Status string (todo|in-progress|blocked|done)
    
  pa task lanes <phase> <milestone>    Show lane usage and next available IDs
    Output: Table with used/available IDs per lane

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

Validation & Reporting:
  pa check                             Validate architecture consistency
    Output: Validation errors and warnings
    
  pa report                            Generate architecture report
    Output: Report text

Documentation:
  pa docs                              List all architecture docs
    Output: Category and file paths

Help System:
  pa help <topic>                      Get detailed help on a topic
    Topics: commands, workflows, lanes, decisions, architecture, standards
    
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
     - Change 'status: todo' to 'status: in-progress'
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
  1. Check for consistency issues:
     pa check
     
  2. Generate architecture report:
     pa report
     
  3. List all documentation:
     pa docs
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
    - status: todo|in-progress|blocked|done
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
};

export const TOPIC_LIST = Object.keys(HELP_TOPICS) as Array<keyof typeof HELP_TOPICS>;

export function getHelpTopic(topic: string): string | null {
  if (topic in HELP_TOPICS) {
    return HELP_TOPICS[topic as keyof typeof HELP_TOPICS];
  }
  return null;
}

export function listTopics(): string {
  return `Available help topics:

${TOPIC_LIST.map((topic) => `  ${topic.padEnd(15)} ${getTopicDescription(topic)}`).join("\n")}

Usage: pa help <topic>
`;
}

function getTopicDescription(topic: string): string {
  const descriptions: Record<string, string> = {
    commands: "Complete command reference for AI agents",
    workflows: "Common task and decision workflows",
    lanes: "Task lane system explained",
    decisions: "Architecture decision management",
    architecture: "Repository structure and validation",
    standards: "File naming and schema standards",
  };
  return descriptions[topic] || "";
}
