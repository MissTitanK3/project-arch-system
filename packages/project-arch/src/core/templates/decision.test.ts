import { describe, it, expect } from "vitest";
import { defaultDecisionFrontmatter, defaultDecisionBody } from "./decision";

describe("core/templates/decision", () => {
  it("should generate default decision frontmatter for project scope", () => {
    const frontmatter = defaultDecisionFrontmatter({
      id: "project:20260307:decision",
      title: "Project Decision",
      scope: { kind: "project" },
    });

    expect(frontmatter.schemaVersion).toBe("2.0");
    expect(frontmatter.type).toBe("decision");
    expect(frontmatter.id).toBe("project:20260307:decision");
    expect(frontmatter.title).toBe("Project Decision");
    expect(frontmatter.status).toBe("proposed");
    expect(frontmatter.scope.kind).toBe("project");
    expect(frontmatter.drivers).toEqual([]);
    expect(frontmatter.links.tasks).toEqual([]);
    expect(frontmatter.links.codeTargets).toEqual([]);
    expect(frontmatter.links.publicDocs).toEqual([]);
  });

  it("should preserve milestone scope in frontmatter", () => {
    const frontmatter = defaultDecisionFrontmatter({
      id: "phase-1/m1:20260307:decision",
      title: "Milestone Decision",
      scope: { kind: "milestone", phaseId: "phase-1", milestoneId: "m1" },
    });

    expect(frontmatter.scope.kind).toBe("milestone");
    if (frontmatter.scope.kind === "milestone") {
      expect(frontmatter.scope.phaseId).toBe("phase-1");
      expect(frontmatter.scope.milestoneId).toBe("m1");
    }
  });

  it("should generate default decision body with sections", () => {
    const body = defaultDecisionBody();

    expect(body).toContain("## Context");
    expect(body).toContain("## Decision Details");
    expect(body).toContain("## Implementation Plan");
    expect(body).toContain("## Verification");
    expect(body).toContain("- [ ] ...");
    expect(body.endsWith("\n")).toBe(true);
  });
});
