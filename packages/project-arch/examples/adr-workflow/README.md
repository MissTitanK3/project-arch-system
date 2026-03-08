# ADR (Architecture Decision Record) Workflow Example

This example demonstrates best practices for managing Architecture Decision Records using Project Arch.

## What are ADRs?

Architecture Decision Records (ADRs) document important architectural decisions made during a project. They capture:

- **Context**: The situation and forces that led to the decision
- **Decision**: What was decided
- **Consequences**: The results of the decision (positive and negative)
- **Status**: Proposed, accepted, rejected, deprecated, or superseded

## Basic ADR Workflow

### 1. Creating a New ADR

```bash
# Create a new decision
pa decision new use-typescript

# Or with a more descriptive ID
pa decision new adopt-event-sourcing-pattern
```

### 2. Editing the ADR

Edit the generated file at `arch-model/decisions/use-typescript.md`:

```markdown
---
id: "use-typescript"
title: "Use TypeScript for All New Code"
status: "proposed"
date: "2026-03-07"
---

## Context

We are starting a new project and need to choose between JavaScript and TypeScript.

### Current Situation

- Team has JavaScript experience
- Codebase will grow to support multiple services
- Need to maintain code quality as team scales

### Forces

- **Type Safety**: Catching errors at compile time vs runtime
- **Developer Experience**: Better IDE support and autocomplete
- **Learning Curve**: Team needs to learn TypeScript
- **Build Complexity**: Additional build step required
- **Ecosystem**: Most modern tools support TypeScript well

## Decision

We will use TypeScript for all new code in the project.

### Rationale

- Type safety will prevent entire classes of bugs
- IDE support dramatically improves developer productivity
- Team is willing to invest time in learning
- Industry trend is toward TypeScript adoption

## Consequences

### Positive

- **Type Safety**: Catch errors at compile time
- **Better Refactoring**: Safer and easier to refactor code
- **Documentation**: Types serve as inline documentation
- **IDE Support**: Excellent autocomplete and error detection
- **Team Velocity**: After initial learning curve, development speeds up

### Negative

- **Learning Curve**: 2-4 weeks for team to become proficient
- **Build Step**: Requires compilation before running
- **Configuration**: Need to maintain tsconfig.json
- **Third-party Types**: Some libraries need @types packages
- **Strictness Trade-offs**: May need to balance strictness vs pragmatism

### Risks

- Over-engineering type definitions (can be addressed with guidelines)
- Initial slowdown during learning phase (acceptable trade-off)

## Alternatives Considered

### Plain JavaScript

- **Pros**: No learning curve, no build step
- **Cons**: No type safety, worse IDE support
- **Rejected because**: Benefits of TypeScript outweigh costs

### JSDoc with Type Checking

- **Pros**: Types without new syntax
- **Cons**: Verbose, less powerful than TypeScript
- **Rejected because**: Not as robust as TypeScript

### Flow

- **Pros**: Similar benefits to TypeScript
- **Cons**: Smaller ecosystem, less industry momentum
- **Rejected because**: TypeScript has better tooling and community

## Implementation Plan

1. Week 1: Team training on TypeScript basics
2. Week 2: Set up tsconfig.json and build pipeline
3. Week 3: Convert critical modules to TypeScript
4. Week 4: Establish coding standards and review process

## Related Decisions

- [Use ESLint for Code Quality](./use-eslint.md)
- [Adopt Strict Mode TypeScript](./typescript-strict-mode.md)

## Notes

- TypeScript version: 5.0+
- Will use strict mode from the start
- Team can ask questions in #typescript Slack channel

## References

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- Internal discussion: Meeting notes 2026-03-01
```

### 3. Proposing for Review

Update status to `proposed` and share with team:

```yaml
status: "proposed"
```

### 4. Accepting the Decision

After team review and consensus:

```yaml
status: "accepted"
date: "2026-03-15" # Update to acceptance date
```

### 5. Implementing the Decision

Link related tasks to the ADR:

```bash
# Create a task to implement the decision
pa task new phase-1 milestone-1

# In the task file, reference the ADR
---
id: "005"
title: "Migrate core modules to TypeScript"
status: "not-started"
related_decisions:
  - "use-typescript"
---
```

## Advanced ADR Patterns

### Superseding an ADR

When a decision needs to be replaced:

```markdown
---
id: "use-rest-api"
title: "Use REST API for Service Communication"
status: "superseded"
superseded_by: "adopt-graphql"
date: "2026-02-01"
---

## Context

We initially chose REST for its simplicity.

## Decision

Use REST APIs for all service-to-service communication.

## Status Update (2026-03-15)

This decision has been superseded by [Adopt GraphQL](./adopt-graphql.md) due to:

- Need for flexible data fetching
- Over-fetching problems in mobile app
- Team preference after evaluation
```

### Deprecating an ADR

When a decision is no longer relevant:

```markdown
---
id: "use-mysql"
title: "Use MySQL for Primary Database"
status: "deprecated"
date: "2026-01-15"
deprecated_date: "2026-03-01"
---

## Context

We needed a reliable relational database.

## Decision

Use MySQL 8.0 for primary data storage.

## Deprecation Notice (2026-03-01)

This decision is no longer relevant as we have migrated to PostgreSQL.
See [Migrate to PostgreSQL](./migrate-to-postgresql.md) for details.

The MySQL database has been decommissioned and all data migrated.
```

### Rejecting a Proposal

When a proposed decision is not accepted:

```markdown
---
id: "adopt-microservices"
title: "Adopt Microservices Architecture"
status: "rejected"
date: "2026-03-01"
rejected_date: "2026-03-15"
---

## Context

We considered splitting our monolith into microservices.

## Decision

Proposed: Split application into 5-7 microservices along domain boundaries.

## Status Update (2026-03-15)

**Rejected** after team discussion because:

1. **Team Size**: Only 4 developers; not enough to manage multiple services
2. **Complexity**: Overhead not justified by current scale
3. **Deployment**: Would require significant infrastructure investment
4. **Timing**: Premature optimization; monolith is working well

## What We'll Do Instead

- Keep monolithic architecture
- Improve modular boundaries within monolith
- Revisit in 12 months if team grows significantly

See [Improve Monolith Modularity](./improve-monolith-modularity.md)
```

## ADR Templates

### Technical Decision Template

```markdown
---
id: "decision-id"
title: "Decision Title"
status: "proposed"
date: "2026-03-07"
---

## Context

What is the issue that we're seeing that is motivating this decision?

### Current Situation

Describe the current state.

### Forces

List the key forces (requirements, constraints, concerns) at play.

## Decision

What is the change that we're proposing?

### Rationale

Why did we choose this option?

## Consequences

### Positive

What becomes easier or better?

### Negative

What becomes harder or worse?

### Risks

What could go wrong? How will we mitigate?

## Alternatives Considered

### Alternative 1

- Pros:
- Cons:
- Rejected because:

## Implementation Plan

Step-by-step plan for implementing this decision.

## Related Decisions

Links to related ADRs.

## References

External resources, docs, discussions.
```

### Process Decision Template

```markdown
---
id: "decision-id"
title: "Process Decision"
status: "proposed"
date: "2026-03-07"
---

## Context

What process or practice needs to be established?

## Decision

What process are we adopting?

## Why This Matters

Impact on team, workflow, quality, etc.

## How To Follow This Process

Step-by-step guide.

## Success Metrics

How will we measure if this is working?

## Review Schedule

When will we review this decision?

## Related Decisions

Links to related ADRs.
```

## Working with ADRs Programmatically

### List All ADRs

```typescript
import { decisions } from "project-arch";

async function listADRs() {
  const allDecisions = await decisions.listDecisions(process.cwd());

  console.log("\\n📋 Architecture Decision Records\\n");

  const byStatus = {
    proposed: allDecisions.filter((d) => d.status === "proposed"),
    accepted: allDecisions.filter((d) => d.status === "accepted"),
    rejected: allDecisions.filter((d) => d.status === "rejected"),
    deprecated: allDecisions.filter((d) => d.status === "deprecated"),
    superseded: allDecisions.filter((d) => d.status === "superseded"),
  };

  Object.entries(byStatus).forEach(([status, decs]) => {
    if (decs.length > 0) {
      console.log(`\\n${status.toUpperCase()}:`);
      decs.forEach((d) => console.log(`  - ${d.title} (${d.id})`));
    }
  });
}

listADRs();
```

### Generate ADR Report

```typescript
import { decisions } from "project-arch";
import { writeFile } from "fs/promises";

async function generateADRReport() {
  const allDecisions = await decisions.listDecisions(process.cwd());

  let markdown = "# Architecture Decision Records\\n\\n";
  markdown += `Total Decisions: ${allDecisions.length}\\n\\n`;

  markdown += "## Index\\n\\n";
  allDecisions.forEach((d) => {
    markdown += `- [${d.title}](#${d.id}) - ${d.status}\\n`;
  });

  markdown += "\\n## Details\\n\\n";

  for (const decision of allDecisions) {
    const details = await decisions.readDecision(process.cwd(), decision.id);
    markdown += `### ${details.title} {#${details.id}}\\n\\n`;
    markdown += `**Status**: ${details.status}\\n`;
    markdown += `**Date**: ${details.date}\\n\\n`;
    markdown += `${details.context}\\n\\n`;
  }

  await writeFile("arch-model/docs/adr-report.md", markdown);
  console.log("ADR report generated!");
}

generateADRReport();
```

### Validate ADR Compliance

```typescript
import { decisions, tasks } from "project-arch";

async function validateADRLinks() {
  // Check that all decisions reference at least one task
  const allDecisions = await decisions.listDecisions(process.cwd());

  for (const decision of allDecisions) {
    if (decision.status === "accepted") {
      // Find tasks that reference this decision
      // Implementation would search task files
      console.log(`Checking implementation tasks for ${decision.id}`);
    }
  }
}
```

## Best Practices

### 1. Write ADRs at the Right Time

- **Too Early**: Before you understand the problem
- **Too Late**: After the code is written
- **Just Right**: When you have enough context but before implementation

### 2. Keep ADRs Concise

- Focus on the decision and its rationale
- Include only relevant context
- Use bullet points for clarity
- Aim for 1-2 pages maximum

### 3. Review and Update

- Review proposed ADRs in team meetings
- Update status promptly after decisions
- Link to implementation tasks
- Deprecate or supersede when necessary

### 4. Make ADRs Discoverable

- Use clear, descriptive titles
- Tag related ADRs
- Generate indexes and reports
- Include in onboarding materials

### 5. Link to Implementation

- Reference ADRs in related tasks
- Include ADR links in PR descriptions
- UpdateADRs if implementation reveals issues

## Integration with CI/CD

### Pre-commit Hook

```bash
#!/usr/bin/env bash
# Check that ADR files are valid
pa check
```

### PR Template

```markdown
## Changes

Description of changes

## Related ADRs

- [ ] This PR implements [ADR-005: Use TypeScript](../arch-model/decisions/use-typescript.md)
- [ ] This PR requires a new ADR

## ADR Updates

- [ ] ADR status updated if applicable
- [ ] New ADR created if needed
```

## Next Steps

- Review [Basic CLI Usage](../basic-cli/README.md) for general workflow
- Explore [SDK Integration](../sdk-integration/README.md) for programmatic access
- Check [Custom Commands](../custom-commands/README.md) for extending functionality
