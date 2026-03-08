# Custom Commands Example

This example shows how to create custom validation checks and extend Project Arch functionality.

## Creating Custom Validation Checks

### Basic Custom Check

```typescript
// custom-checks/check-task-descriptions.ts
import { tasks, phases, milestones } from "project-arch";

interface CheckResult {
  passed: boolean;
  message: string;
  taskId?: string;
}

/**
 * Validates that all tasks have meaningful descriptions (at least 50 characters).
 */
export async function checkTaskDescriptions(projectRoot: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const allPhases = await phases.listPhases(projectRoot);

  for (const phase of allPhases) {
    const phaseMilestones = await milestones.listMilestones(projectRoot, phase.id);

    for (const milestone of phaseMilestones) {
      const milestoneTasks = await tasks.readTasks(projectRoot, phase.id, milestone.id);

      for (const task of milestoneTasks) {
        const description = task.description || "";

        if (description.length < 50) {
          results.push({
            passed: false,
            message: `Task ${phase.id}/${milestone.id}/${task.id} has insufficient description (${description.length} chars, need 50+)`,
            taskId: task.id,
          });
        } else {
          results.push({
            passed: true,
            message: `Task ${phase.id}/${milestone.id}/${task.id} has adequate description`,
            taskId: task.id,
          });
        }
      }
    }
  }

  return results;
}

// Run the check
async function main() {
  const results = await checkTaskDescriptions(process.cwd());
  const failed = results.filter((r) => !r.passed);

  console.log(`\\nTask Description Check:`);
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\\nFailures:");
    failed.forEach((f) => console.log(`  ❌ ${f.message}`));
    process.exit(1);
  }

  console.log("\\n✅ All tasks have adequate descriptions");
}

if (require.main === module) {
  main().catch(console.error);
}
```

### Advanced Custom Check with Dependencies

```typescript
// custom-checks/check-dependency-depth.ts
import { graph } from "project-arch";

interface DepthCheckResult {
  taskId: string;
  depth: number;
  chain: string[];
  passed: boolean;
}

const MAX_DEPENDENCY_DEPTH = 5;

/**
 * Checks that task dependency chains don't exceed maximum depth.
 * Deep dependency chains can indicate poor task decomposition.
 */
export async function checkDependencyDepth(projectRoot: string): Promise<DepthCheckResult[]> {
  const results: DepthCheckResult[] = [];
  const nodes = await graph.buildProjectGraph(projectRoot);

  for (const node of nodes) {
    const depth = calculateDepth(node, nodes, []);

    results.push({
      taskId: node.id,
      depth,
      chain: [], // Would be populated by traversal
      passed: depth <= MAX_DEPENDENCY_DEPTH,
    });
  }

  return results;
}

function calculateDepth(node: any, allNodes: any[], visited: string[]): number {
  // Avoid cycles
  if (visited.includes(node.id)) return 0;

  const dependencies = node.dependencies || [];
  if (dependencies.length === 0) return 0;

  visited.push(node.id);

  const depths = dependencies.map((depId: string) => {
    const depNode = allNodes.find((n) => n.id === depId);
    if (!depNode) return 0;
    return 1 + calculateDepth(depNode, allNodes, [...visited]);
  });

  return Math.max(...depths);
}

async function main() {
  const results = await checkDependencyDepth(process.cwd());
  const failed = results.filter((r) => !r.passed);

  console.log(`\\nDependency Depth Check (max: ${MAX_DEPENDENCY_DEPTH}):`);
  console.log(`Total tasks: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\\nTasks with excessive dependency depth:");
    failed.forEach((f) => {
      console.log(`  ❌ Task ${f.taskId}: depth ${f.depth}`);
    });
    process.exit(1);
  }

  console.log("\\n✅ All dependency chains within limits");
}

if (require.main === module) {
  main().catch(console.error);
}
```

### Custom Check: Enforcing Task Estimation

```typescript
// custom-checks/check-task-estimates.ts
import { tasks, phases, milestones } from "project-arch";

interface EstimationCheck {
  taskId: string;
  hasEstimate: boolean;
  estimate?: string;
  passed: boolean;
}

/**
 * Ensures all non-backlog tasks have time estimates.
 */
export async function checkTaskEstimates(projectRoot: string): Promise<EstimationCheck[]> {
  const results: EstimationCheck[] = [];
  const allPhases = await phases.listPhases(projectRoot);

  for (const phase of allPhases) {
    const phaseMilestones = await milestones.listMilestones(projectRoot, phase.id);

    for (const milestone of phaseMilestones) {
      const milestoneTasks = await tasks.readTasks(projectRoot, phase.id, milestone.id);

      for (const task of milestoneTasks) {
        // Skip backlog items
        const isBacklog = task.id >= 901 && task.id <= 999;
        if (isBacklog) continue;

        const hasEstimate = task.estimate !== undefined && task.estimate !== null;

        results.push({
          taskId: `${phase.id}/${milestone.id}/${task.id}`,
          hasEstimate,
          estimate: task.estimate,
          passed: hasEstimate,
        });
      }
    }
  }

  return results;
}

async function main() {
  const results = await checkTaskEstimates(process.cwd());
  const failed = results.filter((r) => !r.passed);

  console.log(`\\nTask Estimation Check:`);
  console.log(`Total tasks checked: ${results.length}`);
  console.log(`With estimates: ${results.filter((r) => r.passed).length}`);
  console.log(`Missing estimates: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\\nTasks missing estimates:");
    failed.forEach((f) => {
      console.log(`  ❌ ${f.taskId}`);
    });
    console.log("\\nAdd 'estimate' field to task frontmatter (e.g., '2h', '1d', '3d')");
    process.exit(1);
  }

  console.log("\\n✅ All tasks have time estimates");
}

if (require.main === module) {
  main().catch(console.error);
}
```

## Creating Custom CLI Commands

### Adding a Custom Report Command

```typescript
// custom-commands/generate-burndown.ts
import { tasks, phases, milestones } from "project-arch";
import { writeFile } from "fs/promises";

interface BurndownData {
  date: string;
  total: number;
  completed: number;
  remaining: number;
}

/**
 * Generates burndown chart data for the project.
 */
async function generateBurndown(projectRoot: string): Promise<BurndownData[]> {
  const data: BurndownData[] = [];
  const allPhases = await phases.listPhases(projectRoot);

  let totalTasks = 0;
  let completedTasks = 0;

  for (const phase of allPhases) {
    const phaseMilestones = await milestones.listMilestones(projectRoot, phase.id);

    for (const milestone of phaseMilestones) {
      const milestoneTasks = await tasks.readTasks(projectRoot, phase.id, milestone.id);

      totalTasks += milestoneTasks.length;
      completedTasks += milestoneTasks.filter((t) => t.status === "complete").length;
    }
  }

  data.push({
    date: new Date().toISOString().split("T")[0],
    total: totalTasks,
    completed: completedTasks,
    remaining: totalTasks - completedTasks,
  });

  return data;
}

async function main() {
  const data = await generateBurndown(process.cwd());
  const current = data[0];

  console.log("\\n📈 Burndown Report");
  console.log("==================");
  console.log(`Date: ${current.date}`);
  console.log(`Total Tasks: ${current.total}`);
  console.log(`Completed: ${current.completed}`);
  console.log(`Remaining: ${current.remaining}`);
  console.log(`Progress: ${((current.completed / current.total) * 100).toFixed(1)}%`);

  // Save to file
  const outputPath = "arch-model/reports/burndown.json";
  await writeFile(outputPath, JSON.stringify(data, null, 2));
  console.log(`\\nData saved to ${outputPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}
```

### Custom Task Analysis Command

```typescript
// custom-commands/analyze-task-velocity.ts
import { tasks, phases, milestones } from "project-arch";

interface VelocityMetrics {
  plannedCompleted: number;
  discoveredCreated: number;
  driftRate: number;
  averageTimeToComplete: number;
}

/**
 * Analyzes task velocity and drift metrics.
 */
async function analyzeVelocity(projectRoot: string): Promise<VelocityMetrics> {
  const allPhases = await phases.listPhases(projectRoot);

  let plannedCompleted = 0;
  let discoveredCreated = 0;
  let totalCompleted = 0;

  for (const phase of allPhases) {
    const phaseMilestones = await milestones.listMilestones(projectRoot, phase.id);

    for (const milestone of phaseMilestones) {
      const milestoneTasks = await tasks.readTasks(projectRoot, phase.id, milestone.id);

      // Count completed planned tasks
      const completedPlanned = milestoneTasks.filter(
        (t) => t.status === "complete" && t.id >= 1 && t.id <= 99,
      );
      plannedCompleted += completedPlanned.length;

      // Count discovered tasks
      const discovered = milestoneTasks.filter((t) => t.id >= 101 && t.id <= 199);
      discoveredCreated += discovered.length;

      totalCompleted += milestoneTasks.filter((t) => t.status === "complete").length;
    }
  }

  const driftRate = plannedCompleted > 0 ? (discoveredCreated / plannedCompleted) * 100 : 0;

  return {
    plannedCompleted,
    discoveredCreated,
    driftRate,
    averageTimeToComplete: 0, // Would require date tracking
  };
}

async function main() {
  const metrics = await analyzeVelocity(process.cwd());

  console.log("\\n⚡ Task Velocity Analysis");
  console.log("========================");
  console.log(`Planned Tasks Completed: ${metrics.plannedCompleted}`);
  console.log(`Discovered Tasks Created: ${metrics.discoveredCreated}`);
  console.log(`Drift Rate: ${metrics.driftRate.toFixed(1)}%`);

  if (metrics.driftRate > 30) {
    console.log("\\n⚠️  High drift rate detected!");
    console.log("   Consider improving initial planning or breaking down tasks further.");
  } else if (metrics.driftRate < 10) {
    console.log("\\n✅ Low drift rate - planning is accurate!");
  } else {
    console.log("\\n👍 Drift rate within acceptable range.");
  }
}

if (require.main === module) {
  main().catch(console.error);
}
```

## Integrating Custom Commands into Your Workflow

### Creating a Custom CLI Wrapper

```typescript
// bin/pa-custom.ts
#!/usr/bin/env node

import { Command } from "commander";
import { checkTaskDescriptions } from "./custom-checks/check-task-descriptions";
import { checkDependencyDepth } from "./custom-checks/check-dependency-depth";
import { checkTaskEstimates } from "./custom-checks/check-task-estimates";
import { generateBurndown } from "./custom-commands/generate-burndown";
import { analyzeVelocity } from "./custom-commands/analyze-task-velocity";

const program = new Command();

program
  .name("pa-custom")
  .description("Custom extensions for Project Arch")
  .version("1.0.0");

program
  .command("check-descriptions")
  .description("Validate that all tasks have meaningful descriptions")
  .action(async () => {
    const results = await checkTaskDescriptions(process.cwd());
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
      console.error("Check failed!");
      process.exit(1);
    }
    console.log("✅ All tasks have adequate descriptions");
  });

program
  .command("check-depth")
  .description("Check dependency chain depth")
  .action(async () => {
    const results = await checkDependencyDepth(process.cwd());
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
      console.error("Check failed!");
      process.exit(1);
    }
    console.log("✅ All dependency chains within limits");
  });

program
  .command("check-estimates")
  .description("Ensure all tasks have time estimates")
  .action(async () => {
    const results = await checkTaskEstimates(process.cwd());
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
      console.error("Check failed!");
      process.exit(1);
    }
    console.log("✅ All tasks have estimates");
  });

program
  .command("burndown")
  .description("Generate burndown chart data")
  .action(async () => {
    await generateBurndown(process.cwd());
  });

program
  .command("velocity")
  .description("Analyze task velocity and drift")
  .action(async () => {
    await analyzeVelocity(process.cwd());
  });

program
  .command("check-all")
  .description("Run all custom validation checks")
  .action(async () => {
    console.log("Running all custom checks...\\n");

    const checks = [
      { name: "Task Descriptions", fn: checkTaskDescriptions },
      { name: "Dependency Depth", fn: checkDependencyDepth },
      { name: "Task Estimates", fn: checkTaskEstimates },
    ];

    let allPassed = true;

    for (const check of checks) {
      const results = await check.fn(process.cwd());
      const failed = results.filter((r: any) => !r.passed);

      if (failed.length > 0) {
        console.log(`❌ ${check.name}: ${failed.length} failures`);
        allPassed = false;
      } else {
        console.log(`✅ ${check.name}: passed`);
      }
    }

    if (!allPassed) {
      console.log("\\nSome checks failed!");
      process.exit(1);
    }

    console.log("\\n✅ All custom checks passed!");
  });

program.parse();
```

### Adding to package.json

```json
{
  "scripts": {
    "arch:check": "pa check",
    "arch:custom-check": "tsx bin/pa-custom.ts check-all",
    "arch:burndown": "tsx bin/pa-custom.ts burndown",
    "arch:velocity": "tsx bin/pa-custom.ts velocity",
    "arch:full-check": "pnpm arch:check && pnpm arch:custom-check"
  }
}
```

## Testing Custom Commands

```typescript
// custom-commands/__tests__/check-task-descriptions.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkTaskDescriptions } from "../check-task-descriptions";
import { setupTestProject, cleanupTestProject } from "./test-helpers";

describe("checkTaskDescriptions", () => {
  const testDir = "/tmp/test-custom-checks";

  beforeEach(async () => {
    await setupTestProject(testDir);
  });

  afterEach(async () => {
    await cleanupTestProject(testDir);
  });

  it("should pass for tasks with adequate descriptions", async () => {
    const results = await checkTaskDescriptions(testDir);
    const passed = results.filter((r) => r.passed);
    expect(passed.length).toBeGreaterThan(0);
  });

  it("should fail for tasks with short descriptions", async () => {
    // Create a task with short description
    const results = await checkTaskDescriptions(testDir);
    const failed = results.filter((r) => !r.passed);
    expect(failed.length).toBeGreaterThan(0);
  });
});
```

## Next Steps

- Review the [ADR Workflow](../adr-workflow/README.md) example
- Explore the full [SDK documentation](../../README.md#sdkprogrammatic-usage)
- Check out the [Basic CLI](../basic-cli/README.md) examples
