# SDK Integration Example

This example demonstrates how to use the Project Arch SDK programmatically in your applications.

## Setup

Install project-arch as a dependency:

```bash
npm install project-arch
```

## Basic Usage

### Reading Architecture Data

```typescript
import { phases, milestones, tasks } from "project-arch";

async function getProjectStatus() {
  const projectRoot = process.cwd();

  // List all phases
  const allPhases = await phases.listPhases(projectRoot);
  console.log(`Total phases: ${allPhases.length}`);

  // Get milestones for each phase
  for (const phase of allPhases) {
    const phaseMilestones = await milestones.listMilestones(projectRoot, phase.id);
    console.log(`Phase ${phase.id}: ${phaseMilestones.length} milestones`);

    // Get tasks for each milestone
    for (const milestone of phaseMilestones) {
      const milestoneTasks = await tasks.readTasks(projectRoot, phase.id, milestone.id);

      const completed = milestoneTasks.filter((t) => t.status === "complete");
      const inProgress = milestoneTasks.filter((t) => t.status === "in-progress");

      console.log(
        `  ${milestone.id}: ${completed.length}/${milestoneTasks.length} tasks complete, ` +
          `${inProgress.length} in progress`,
      );
    }
  }
}

getProjectStatus().catch(console.error);
```

### Task Management

```typescript
import { tasks } from "project-arch";

async function manageTask() {
  const projectRoot = process.cwd();
  const phaseId = "phase-1";
  const milestoneId = "milestone-1";
  const taskId = "005";

  // Read a specific task
  const task = await tasks.readTask(projectRoot, phaseId, milestoneId, taskId);
  console.log(`Task: ${task.title}`);
  console.log(`Status: ${task.status}`);
  console.log(`Lane: ${task.lane}`);

  // Update task status
  if (task.status === "not-started") {
    await tasks.updateTaskStatus(projectRoot, phaseId, milestoneId, taskId, "in-progress");
    console.log("Task started!");
  }

  // Read all tasks in a milestone
  const allTasks = await tasks.readTasks(projectRoot, phaseId, milestoneId);

  // Group by lane
  const byLane = {
    planned: allTasks.filter((t) => t.id >= 1 && t.id <= 99),
    discovered: allTasks.filter((t) => t.id >= 101 && t.id <= 199),
    backlog: allTasks.filter((t) => t.id >= 901 && t.id <= 999),
  };

  console.log(`Planned: ${byLane.planned.length}`);
  console.log(`Discovered: ${byLane.discovered.length}`);
  console.log(`Backlog: ${byLane.backlog.length}`);
}
```

### Running Validations

```typescript
import { check } from "project-arch";

async function validateProject() {
  const projectRoot = process.cwd();

  try {
    const results = await check.runRepositoryChecks(projectRoot);

    console.log(`Checks passed: ${results.passed}`);
    console.log(`Checks failed: ${results.failed}`);

    if (results.failed > 0) {
      console.error("\\nValidation failures:");
      results.failures.forEach((failure) => {
        console.error(`  ❌ ${failure.check}: ${failure.message}`);
      });
      process.exit(1);
    }

    console.log("✅ All validations passed!");
  } catch (error) {
    console.error("Validation error:", error);
    process.exit(1);
  }
}

validateProject().catch(console.error);
```

### Building Dependency Graph

```typescript
import { graph } from "project-arch";

async function analyzeDependencies() {
  const projectRoot = process.cwd();

  // Build full graph
  const nodes = await graph.buildProjectGraph(projectRoot);
  console.log(`Total nodes in graph: ${nodes.length}`);

  // Trace dependencies for a specific task
  const dependencies = await graph.traceTask(projectRoot, "phase-1", "milestone-1", "005");

  console.log("\\nTask 005 Dependencies:");
  console.log(`Upstream (blocks this task): ${dependencies.upstream.join(", ")}`);
  console.log(`Downstream (blocked by this task): ${dependencies.downstream.join(", ")}`);

  // Check for circular dependencies
  const circular = await graph.detectCircularDependencies(projectRoot);

  if (circular.length > 0) {
    console.warn("\\n⚠️  Circular dependencies detected:");
    circular.forEach((cycle) => {
      console.warn(`  ${cycle.join(" → ")}`);
    });
  } else {
    console.log("\\n✅ No circular dependencies");
  }
}
```

### Working with Decisions

```typescript
import { decisions } from "project-arch";

async function analyzeDecisions() {
  const projectRoot = process.cwd();

  // List all decisions
  const allDecisions = await decisions.listDecisions(projectRoot);

  // Group by status
  const byStatus = {
    proposed: allDecisions.filter((d) => d.status === "proposed"),
    accepted: allDecisions.filter((d) => d.status === "accepted"),
    rejected: allDecisions.filter((d) => d.status === "rejected"),
    deprecated: allDecisions.filter((d) => d.status === "deprecated"),
  };

  console.log("Architecture Decisions:");
  console.log(`  Proposed: ${byStatus.proposed.length}`);
  console.log(`  Accepted: ${byStatus.accepted.length}`);
  console.log(`  Rejected: ${byStatus.rejected.length}`);
  console.log(`  Deprecated: ${byStatus.deprecated.length}`);

  // Read specific decision
  const decision = await decisions.readDecision(projectRoot, "use-typescript");
  console.log(`\\nDecision: ${decision.title}`);
  console.log(`Status: ${decision.status}`);
  console.log(`Date: ${decision.date}`);
}
```

## Complete Dashboard Example

Here's a complete example that creates a project dashboard:

```typescript
import { phases, milestones, tasks, decisions, check } from "project-arch";

interface DashboardData {
  phases: number;
  milestones: number;
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    byLane: Record<string, number>;
  };
  decisions: {
    total: number;
    byStatus: Record<string, number>;
  };
  validations: {
    passed: number;
    failed: number;
  };
}

async function generateDashboard(): Promise<DashboardData> {
  const projectRoot = process.cwd();

  // Gather all data in parallel
  const [allPhases, allDecisions, validationResults] = await Promise.all([
    phases.listPhases(projectRoot),
    decisions.listDecisions(projectRoot),
    check.runRepositoryChecks(projectRoot),
  ]);

  // Collect task data
  let totalTasks = 0;
  const tasksByStatus: Record<string, number> = {};
  const tasksByLane: Record<string, number> = { planned: 0, discovered: 0, backlog: 0 };

  for (const phase of allPhases) {
    const phaseMilestones = await milestones.listMilestones(projectRoot, phase.id);

    for (const milestone of phaseMilestones) {
      const milestoneTasks = await tasks.readTasks(projectRoot, phase.id, milestone.id);

      totalTasks += milestoneTasks.length;

      // Count by status
      milestoneTasks.forEach((task) => {
        tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;

        // Count by lane
        if (task.id >= 1 && task.id <= 99) tasksByLane.planned++;
        else if (task.id >= 101 && task.id <= 199) tasksByLane.discovered++;
        else if (task.id >= 901 && task.id <= 999) tasksByLane.backlog++;
      });
    }
  }

  // Count decisions by status
  const decisionsByStatus: Record<string, number> = {};
  allDecisions.forEach((decision) => {
    decisionsByStatus[decision.status] = (decisionsByStatus[decision.status] || 0) + 1;
  });

  return {
    phases: allPhases.length,
    milestones: await countMilestones(projectRoot, allPhases),
    tasks: {
      total: totalTasks,
      byStatus: tasksByStatus,
      byLane: tasksByLane,
    },
    decisions: {
      total: allDecisions.length,
      byStatus: decisionsByStatus,
    },
    validations: {
      passed: validationResults.passed,
      failed: validationResults.failed,
    },
  };
}

async function countMilestones(projectRoot: string, phases: any[]): Promise<number> {
  let count = 0;
  for (const phase of phases) {
    const phaseMilestones = await milestones.listMilestones(projectRoot, phase.id);
    count += phaseMilestones.length;
  }
  return count;
}

function displayDashboard(data: DashboardData) {
  console.log("\\n📊 Project Architecture Dashboard");
  console.log("=====================================\\n");

  console.log(`Phases: ${data.phases}`);
  console.log(`Milestones: ${data.milestones}`);
  console.log(`\\nTasks: ${data.tasks.total}`);

  console.log("  By Status:");
  Object.entries(data.tasks.byStatus).forEach(([status, count]) => {
    console.log(`    ${status}: ${count}`);
  });

  console.log("  By Lane:");
  console.log(`    Planned: ${data.tasks.byLane.planned}`);
  console.log(`    Discovered: ${data.tasks.byLane.discovered}`);
  console.log(`    Backlog: ${data.tasks.byLane.backlog}`);

  console.log(`\\nDecisions: ${data.decisions.total}`);
  Object.entries(data.decisions.byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  console.log(`\\nValidations:`);
  console.log(`  Passed: ${data.validations.passed}`);
  console.log(`  Failed: ${data.validations.failed}`);

  if (data.validations.failed > 0) {
    console.log("\\n⚠️  Validation failures detected!");
  } else {
    console.log("\\n✅ All validations passed!");
  }
}

// Run the dashboard
generateDashboard().then(displayDashboard).catch(console.error);
```

## Integration with Build Tools

### As a Pre-commit Hook

```typescript
// scripts/validate-arch.ts
import { check } from "project-arch";

async function validateArchitecture() {
  const results = await check.runRepositoryChecks(process.cwd());

  if (results.failed > 0) {
    console.error("Architecture validation failed!");
    results.failures.forEach((f) => console.error(`  ${f.message}`));
    process.exit(1);
  }

  console.log("Architecture validation passed ✅");
}

validateArchitecture();
```

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
tsx scripts/validate-arch.ts
```

### As a CI/CD Step

```typescript
// scripts/ci-check.ts
import { check, tasks, phases, milestones } from "project-arch";

async function ciCheck() {
  // Run validations
  const results = await check.runRepositoryChecks(process.cwd());

  if (results.failed > 0) {
    console.error("::error::Architecture validation failed");
    process.exit(1);
  }

  // Check for in-progress tasks
  const allPhases = await phases.listPhases(process.cwd());
  let hasInProgress = false;

  for (const phase of allPhases) {
    const phaseMilestones = await milestones.listMilestones(process.cwd(), phase.id);
    for (const milestone of phaseMilestones) {
      const milestoneTasks = await tasks.readTasks(process.cwd(), phase.id, milestone.id);
      if (milestoneTasks.some((t) => t.status === "in-progress")) {
        hasInProgress = true;
        break;
      }
    }
    if (hasInProgress) break;
  }

  if (hasInProgress) {
    console.log("::warning::In-progress tasks detected");
  }

  console.log("CI check passed ✅");
}

ciCheck();
```

## Next Steps

- See [Custom Commands](../custom-commands/README.md) for extending functionality
- Review [ADR Workflow](../adr-workflow/README.md) for decision tracking
- Read the full [API documentation](../../README.md#sdkprogrammatic-usage)
