export const commandMetadata = {
  "tasks.create": {
    description: "Create a planned task",
    inputs: ["phase", "milestone", "title"],
  },
  "tasks.discover": {
    description: "Create a discovered task",
    inputs: ["phase", "milestone", "from", "title"],
  },
  "phases.create": {
    description: "Create a phase",
    inputs: ["id"],
  },
  "milestones.create": {
    description: "Create a milestone",
    inputs: ["phase", "milestone"],
  },
  "decisions.create": {
    description: "Create a decision",
    inputs: ["scope", "phase", "milestone", "slug", "title"],
  },
  "graph.traceTask": {
    description: "Trace a task in the architecture graph",
    inputs: ["task"],
  },
  "next.resolve": {
    description: "Resolve the deterministic next workflow action",
    inputs: [],
  },
  "policy.check": {
    description: "Detect policy conflicts between tasks and architecture",
    inputs: [],
  },
  "policy.explain": {
    description: "Explain policy conflicts with remediation guidance",
    inputs: [],
  },
  "lint.frontmatter": {
    description: "Lint frontmatter for schema and YAML safety issues",
    inputs: ["fix"],
  },
  "agents.list": {
    description: "List resolved agent skills",
    inputs: [],
  },
  "agents.show": {
    description: "Show details for a skill by id",
    inputs: ["id"],
  },
  "agents.new": {
    description: "Scaffold a new user skill",
    inputs: ["id", "title", "summary", "overrides", "tags"],
  },
  "agents.sync": {
    description: "Sync derived skills registry",
    inputs: ["check"],
  },
  "agents.check": {
    description: "Run focused skill validation",
    inputs: [],
  },
} as const;
