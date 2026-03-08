import { describe, it, expect } from "vitest";
import { defaultMilestoneGapClosureReportTemplate } from "./milestoneGapClosure";

describe("core/templates/milestoneGapClosure", () => {
  it("should return milestone gap closure markdown template", () => {
    const template = defaultMilestoneGapClosureReportTemplate();

    expect(template).toContain("# Milestone Gap Closure Report");
    expect(template).toContain("## Executive Summary");
    expect(template).toContain("## Coverage Audit");
    expect(template).toContain("## Remaining Gaps");
    expect(template).toContain("## Template Improvements");
    expect(template).toContain("## Lessons Learned");
    expect(template).toContain("## Next Milestone Recommendations");
    expect(template).toContain("## Appendix");
  });

  it("should include tabular placeholders and checklists", () => {
    const template = defaultMilestoneGapClosureReportTemplate();

    expect(template).toContain("| Task ID | Title | Status | Completion % |");
    expect(template).toContain("| Decision ID | Title | Status | Impact |");
    expect(template).toContain("- [ ] Architecture documentation updated");
    expect(template).toContain("- [ ] Review and incorporate template improvements");
    expect(template.endsWith("\n")).toBe(true);
  });
});
