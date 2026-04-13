import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseTaskWorkflowDocument, readTaskWorkflowDocument } from "./workflows";

const tempRoots: string[] = [];

async function createTempFile(relativePath: string, content: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-workflow-"));
  tempRoots.push(root);
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return target;
}

describe("sdk/workflows", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (!root) {
        continue;
      }

      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("parses explicit 2.0 workflow metadata deterministically", () => {
    const parsed = parseTaskWorkflowDocument(
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "002"',
        'slug: "implement-task-workflow-parsing-and-legacy-fallback-rules"',
        'title: "Implement task workflow parsing and legacy fallback rules"',
        "lane: planned",
        'status: "planned"',
        "taskType: integration",
        "workflow:",
        '  schemaVersion: "2.0"',
        '  template: "integration-delivery"',
        "  stages:",
        "    - id: context-readiness",
        '      title: "Context and Readiness"',
        "      runtimePreference: local",
        "      items:",
        "        - id: review-scope",
        '          label: "Review scope and objective"',
        "          status: done",
        "    - id: implementation",
        '      title: "Implementation"',
        "      runtimePreference: cloud",
        "      items:",
        "        - id: implement-parser",
        '          label: "Implement parsing and fallback behavior"',
        "          status: in_progress",
        "---",
        "",
        "## Acceptance Checks",
        "",
        "- [ ] Explicit workflow metadata parses deterministically.",
      ].join("\n"),
    );

    expect(parsed.frontmatter.taskType).toBe("integration");
    expect(parsed.normalized.workflow.sources.authoritativeWorkflow).toBe("frontmatter");
    expect(parsed.normalized.workflow.stages).toHaveLength(2);
    expect(parsed.normalized.workflow.stages[1]?.items[0]?.status).toBe("in_progress");
    expect(parsed.normalized.workflow.summary.overallState).toBe("in_progress");
  });

  it("falls back to task-type defaults and markdown sections when workflow metadata is absent", () => {
    const parsed = parseTaskWorkflowDocument(
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "002"',
        'slug: "implement-task-workflow-parsing-and-legacy-fallback-rules"',
        'title: "Implement task workflow parsing and legacy fallback rules"',
        "lane: planned",
        'status: "planned"',
        "taskType: research",
        "acceptanceChecks:",
        '  - "Parser coverage includes precedence behavior"',
        "---",
        "",
        "## Scope",
        "",
        "Implement parser behavior.",
        "",
        "## Implementation Plan",
        "",
        "- [x] Parse explicit workflow frontmatter",
        "- [ ] Normalize legacy sections",
        "",
        "## Verification",
        "",
        "- Run focused parser tests",
      ].join("\n"),
    );

    expect(parsed.frontmatter.taskType).toBe("research");
    expect(parsed.normalized.workflow.template).toBe("research-discovery");
    expect(parsed.normalized.workflow.sources.authoritativeWorkflow).toBe("mixed");
    expect(parsed.normalized.workflow.sources.authoritativeCompletion).toBe("mixed");
    expect(parsed.normalized.workflow.stages).toHaveLength(5);

    const implementationStage = parsed.normalized.workflow.stages.find(
      (stage) => stage.id === "implementation",
    );
    expect(implementationStage?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Parse explicit workflow frontmatter", status: "done" }),
        expect.objectContaining({ label: "Normalize legacy sections", status: "planned" }),
      ]),
    );
  });

  it("keeps frontmatter workflow authoritative when mirrored checklist body drifts", () => {
    const parsed = parseTaskWorkflowDocument(
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "003"',
        'slug: "define-mirror-boundaries"',
        'title: "Define mirror boundaries"',
        "lane: planned",
        'status: "planned"',
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
        '          label: "Confirm reconciliation boundary"',
        "          status: planned",
        "---",
        "",
        "## Workflow Checklist (Mirrored)",
        "",
        "### Validation (validation)",
        "",
        "- [x] Confirm reconciliation boundary",
      ].join("\n"),
    );

    expect(parsed.normalized.workflow.sources.authoritativeWorkflow).toBe("frontmatter");
    expect(parsed.normalized.workflow.sources.authoritativeCompletion).toBe("frontmatter");
    expect(parsed.normalized.workflow.sources.supportingMarkdownMirror).toBe("present");
    expect(parsed.normalized.workflow.sources.supportingSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workflow-mirror",
          heading: "Workflow Checklist (Mirrored)",
        }),
      ]),
    );

    const validation = parsed.normalized.workflow.stages.find((stage) => stage.id === "validation");
    expect(validation?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Confirm reconciliation boundary",
          status: "planned",
          source: "frontmatter",
        }),
      ]),
    );
  });

  it("infers task type and stable fallback output for legacy tasks", async () => {
    const filePath = await createTempFile(
      "feedback/phases/phase-a/milestones/m-1/tasks/planned/002-define-parser-contract.md",
      [
        "---",
        'schemaVersion: "2.0"',
        'id: "002"',
        'title: "Define parser contract spec"',
        "lane: planned",
        'status: "planned"',
        "---",
        "",
        "## Scope",
        "",
        "Document the parser contract.",
        "",
        "## Acceptance Checks",
        "",
        "- [x] Contract is explicit",
        "- [ ] Legacy fallback remains deterministic",
        "",
        "## Dependencies",
        "",
        "### Depends On",
        "",
        "- 001",
        "",
        "### Blocks",
        "",
        "- 003",
      ].join("\n"),
    );

    const parsed = await readTaskWorkflowDocument(filePath);

    expect(parsed.frontmatter.slug).toBe("define-parser-contract");
    expect(parsed.frontmatter.taskType).toBe("spec");
    expect(parsed.normalized.workflow.template).toBe("spec-authoring");
    expect(parsed.normalized.workflow.sources.authoritativeWorkflow).toBe("mixed");
    expect(parsed.normalized.workflow.summary.items.total).toBeGreaterThan(0);

    const validationStage = parsed.normalized.workflow.stages.find(
      (stage) => stage.id === "validation",
    );
    expect(validationStage?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Contract is explicit", status: "done" }),
        expect.objectContaining({
          label: "Legacy fallback remains deterministic",
          status: "planned",
        }),
      ]),
    );
  });
});
