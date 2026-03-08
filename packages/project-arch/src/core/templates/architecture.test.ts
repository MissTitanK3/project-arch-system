import { describe, it, expect } from "vitest";
import { defaultArchitectureSpecTemplate } from "./architecture";

describe("core/templates/architecture", () => {
  it("should return architecture spec markdown template", () => {
    const template = defaultArchitectureSpecTemplate();

    expect(template).toContain("# Architecture Spec Template");
    expect(template).toContain("## Name");
    expect(template).toContain("## Purpose");
    expect(template).toContain("## Scope");
    expect(template).toContain("## Design");
    expect(template).toContain("## Data Model");
    expect(template).toContain("## Owning Domain");
    expect(template).toContain("## MVP Constraints");
    expect(template).toContain("## Phase 2+ Enhancements");
    expect(template).toContain("## Implementation Notes");
  });

  it("should include expected checklist placeholders", () => {
    const template = defaultArchitectureSpecTemplate();

    expect(template).toContain("- [ ] ...");
    expect(template).toContain("### In Scope");
    expect(template).toContain("### Out of Scope");
    expect(template).toContain("### Components");
    expect(template.endsWith("\n")).toBe(true);
  });
});
