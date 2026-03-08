import { describe, it, expect } from "vitest";
import { defaultTaskFrontmatter, defaultTaskBody } from "./task";

describe("core/templates/task", () => {
  it("should generate default task frontmatter", () => {
    const frontmatter = defaultTaskFrontmatter({
      id: "001",
      slug: "my-task",
      title: "My Task",
      lane: "planned",
      createdAt: "2026-03-07",
      discoveredFromTask: null,
    });

    expect(frontmatter.schemaVersion).toBe("1.0");
    expect(frontmatter.id).toBe("001");
    expect(frontmatter.slug).toBe("my-task");
    expect(frontmatter.title).toBe("My Task");
    expect(frontmatter.lane).toBe("planned");
    expect(frontmatter.status).toBe("todo");
    expect(frontmatter.createdAt).toBe("2026-03-07");
    expect(frontmatter.updatedAt).toBe("2026-03-07");
    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.codeTargets).toEqual([]);
    expect(frontmatter.publicDocs).toEqual([]);
  });

  it("should preserve discoveredFromTask when provided", () => {
    const frontmatter = defaultTaskFrontmatter({
      id: "101",
      slug: "discovered-task",
      title: "Discovered",
      lane: "discovered",
      createdAt: "2026-03-07",
      discoveredFromTask: "042",
    });

    expect(frontmatter.discoveredFromTask).toBe("042");
    expect(frontmatter.lane).toBe("discovered");
  });

  it("should generate default task body with key sections", () => {
    const body = defaultTaskBody();

    expect(body).toContain("## Scope");
    expect(body).toContain("## Objective");
    expect(body).toContain("## Acceptance Checks");
    expect(body).toContain("## Implementation Plan");
    expect(body).toContain("## Verification");
    expect(body).toContain("## Dependencies");
    expect(body).toContain("### Depends On");
    expect(body).toContain("### Blocks");
    expect(body.endsWith("\n")).toBe(true);
  });
});
