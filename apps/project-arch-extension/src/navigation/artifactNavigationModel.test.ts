import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildArtifactNavigationModel } from "./artifactNavigationModel";

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-nav-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
}

describe("buildArtifactNavigationModel", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const target = tempRoots.pop();
      if (!target) {
        continue;
      }

      await fs.rm(target, { recursive: true, force: true });
    }
  });

  it("builds task, run, diff, and audit groups from canonical repository artifacts", async () => {
    const root = await createTempWorkspace();

    await writeFile(
      root,
      "feedback/phases/phase-a/milestones/m-1/tasks/planned/001-first-task.md",
      [
        "---",
        'id: "001"',
        'title: "First task"',
        'status: "planned"',
        "lane: planned",
        "taskType: spec",
        "workflow:",
        '  schemaVersion: "2.0"',
        '  template: "spec-authoring"',
        "  stages:",
        "    - id: context-readiness",
        '      title: "Context and Readiness"',
        "      runtimePreference: local",
        "      items:",
        "        - id: review-scope",
        '          label: "Review scope and objective"',
        "          status: done",
        "---",
        "",
        "## Acceptance Checks",
        "",
        "- [ ] Reviewable.",
      ].join("\n"),
    );
    await writeFile(root, ".project-arch/agent-runtime/runs/run-2026-04-02-100000.json", "{}");
    await writeFile(root, ".project-arch/reconcile/001-2026-04-02.md", "# reconcile");
    await writeFile(root, ".project-arch/agent-runtime/logs/execution.jsonl", "{}\n");

    const model = await buildArtifactNavigationModel(root);

    const taskGroup = model.groups.find((group) => group.kind === "task");
    const runGroup = model.groups.find((group) => group.kind === "run");
    const diffGroup = model.groups.find((group) => group.kind === "diff");
    const auditGroup = model.groups.find((group) => group.kind === "audit");

    expect(taskGroup?.entries).toHaveLength(1);
    expect(taskGroup?.entries[0]).toEqual(
      expect.objectContaining({
        relativePath: "feedback/phases/phase-a/milestones/m-1/tasks/planned/001-first-task.md",
        label: "001 First task",
        description: "planned • planned",
        taskWorkflow: expect.objectContaining({
          task: expect.objectContaining({ taskType: "spec" }),
          workflow: expect.objectContaining({
            sources: expect.objectContaining({ authoritativeWorkflow: "frontmatter" }),
          }),
        }),
      }),
    );

    expect(runGroup?.entries).toHaveLength(1);
    expect(runGroup?.entries[0]?.relativePath).toBe(
      ".project-arch/agent-runtime/runs/run-2026-04-02-100000.json",
    );

    expect(diffGroup?.entries).toHaveLength(1);
    expect(diffGroup?.entries[0]?.relativePath).toBe(".project-arch/reconcile/001-2026-04-02.md");

    expect(auditGroup?.entries).toHaveLength(1);
    expect(auditGroup?.entries[0]?.relativePath).toBe(
      ".project-arch/agent-runtime/logs/execution.jsonl",
    );
  });

  it("returns empty groups when canonical artifact folders do not exist", async () => {
    const root = await createTempWorkspace();
    const model = await buildArtifactNavigationModel(root);

    for (const group of model.groups) {
      expect(group.entries).toHaveLength(0);
    }
  });

  it("normalizes legacy task files through fallback parsing", async () => {
    const root = await createTempWorkspace();

    await writeFile(
      root,
      "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-legacy-task.md",
      [
        "---",
        'id: "002"',
        'title: "Legacy parser spec"',
        'status: "planned"',
        "lane: planned",
        "---",
        "",
        "## Implementation Plan",
        "",
        "- [x] Parse frontmatter",
        "- [ ] Normalize legacy sections",
        "",
        "## Verification",
        "",
        "- Run focused parser validation",
      ].join("\n"),
    );

    const model = await buildArtifactNavigationModel(root);
    const taskGroup = model.groups.find((group) => group.kind === "task");
    const entry = taskGroup?.entries[0];

    expect(entry?.taskWorkflow).toBeDefined();
    expect(entry?.taskWorkflow?.workflow.sources.authoritativeWorkflow).toBe("mixed");
    expect(entry?.taskWorkflow?.task.taskType).toBe("spec");
    expect(
      entry?.taskWorkflow?.workflow.stages.find((stage) => stage.id === "implementation")?.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Parse frontmatter", status: "done" }),
        expect.objectContaining({ label: "Normalize legacy sections", status: "planned" }),
      ]),
    );
  });

  it("keeps explicit frontmatter workflow state when mirrored checklist body drifts", async () => {
    const root = await createTempWorkspace();

    await writeFile(
      root,
      "feedback/phases/phase-a/milestones/m-1/tasks/planned/003-mirror-boundary.md",
      [
        "---",
        'id: "003"',
        'title: "Mirror boundary"',
        'status: "planned"',
        "lane: planned",
        "taskType: spec",
        "workflow:",
        '  schemaVersion: "2.0"',
        '  template: "spec-authoring"',
        "  stages:",
        "    - id: validation",
        '      title: "Validation"',
        "      runtimePreference: local",
        "      items:",
        "        - id: confirm-boundary",
        '          label: "Confirm mirror boundary"',
        "          status: planned",
        "---",
        "",
        "## Workflow Checklist (Mirrored)",
        "",
        "### Validation (validation)",
        "",
        "- [x] Confirm mirror boundary",
      ].join("\n"),
    );

    const model = await buildArtifactNavigationModel(root);
    const taskGroup = model.groups.find((group) => group.kind === "task");
    const entry = taskGroup?.entries[0];

    expect(entry?.taskWorkflow?.workflow.sources.authoritativeWorkflow).toBe("frontmatter");
    expect(entry?.taskWorkflow?.workflow.sources.authoritativeCompletion).toBe("frontmatter");
    expect(entry?.taskWorkflow?.workflow.sources.supportingSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workflow-mirror",
          heading: "Workflow Checklist (Mirrored)",
        }),
      ]),
    );
    expect(
      entry?.taskWorkflow?.workflow.stages.find((stage) => stage.id === "validation")?.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Confirm mirror boundary", status: "planned" }),
      ]),
    );
  });
});
