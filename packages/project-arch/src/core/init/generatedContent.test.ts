import { describe, expect, it } from "vitest";
import {
  renderBulletSteps,
  renderGeneratedWorkflowFile,
  renderOrderedSteps,
  renderTaskBody,
  type GeneratedWorkflowDefinition,
  type PlannedBootstrapTask,
} from "./generatedContent";

describe("core/init/generatedContent", () => {
  it("renders ordered and bullet step helpers with stable prefixes", () => {
    expect(renderOrderedSteps(["first", "second"])).toEqual(["1. first", "2. second"]);
    expect(renderBulletSteps(["alpha", "beta"])).toEqual(["- alpha", "- beta"]);
  });

  it("renders generated workflow files with ordered commands and bullet sections", () => {
    const workflow: GeneratedWorkflowDefinition = {
      slug: "before-coding",
      title: "Before Coding Workflow",
      purpose: "Prepare implementation before editing files.",
      whenToUse: ["before starting work", "before changing governed surfaces"],
      commandSequence: ["Resolve context", "Review targets", "Run pa check"],
      validationOrFollowUp: ["Do not guess", "Stop when context is missing"],
      adaptationNote: "This is helper guidance only.",
    };

    const rendered = renderGeneratedWorkflowFile(workflow);

    expect(rendered).toContain("# Before Coding Workflow");
    expect(rendered).toContain("- before starting work");
    expect(rendered).toContain("1. Resolve context");
    expect(rendered).toContain("3. Run pa check");
    expect(rendered).toContain("## Required Context");
    expect(rendered).toContain("## Fail-Safe Behavior");
    expect(rendered).toContain("## Authority Reminder");
    expect(rendered).toContain("## Related Governance");
  });

  it("renders bootstrap task bodies with required input, questions, plan, and verification", () => {
    const task: PlannedBootstrapTask = {
      id: "001",
      slug: "define-project-overview",
      title: "Define project overview",
      tags: ["setup"],
      completionCriteria: ["overview is complete"],
      objective: "Capture project framing.",
      questions: ["What problem does this solve?"],
      implementationPlan: ["Fill the overview doc", "Review the result"],
      verification: ["Run pa check and verify OK"],
    };

    const rendered = renderTaskBody(task);

    expect(rendered).toContain("## Objective");
    expect(rendered).toContain("Capture project framing.");
    expect(rendered).toContain("## Required Input");
    expect(rendered).toContain("- What problem does this solve?");
    expect(rendered).toContain("1. Fill the overview doc");
    expect(rendered).toContain("## Verification");
    expect(rendered).toContain(
      "- Use `architecture/product-framing/prompt.md` as the canonical setup prompt source.",
    );
  });
});
