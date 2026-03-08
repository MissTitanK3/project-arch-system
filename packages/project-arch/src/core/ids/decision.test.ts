import { describe, it, expect } from "vitest";
import { buildDecisionId, scopePrefix } from "./decision";

describe("Decision ID utilities", () => {
  describe("scopePrefix", () => {
    it("returns 'project' for project scope", () => {
      expect(scopePrefix({ kind: "project" })).toBe("project");
    });

    it("returns phase id for phase scope", () => {
      expect(scopePrefix({ kind: "phase", phaseId: "phase-2" })).toBe("phase-2");
    });

    it("returns phase/milestone for milestone scope", () => {
      expect(
        scopePrefix({ kind: "milestone", phaseId: "phase-2", milestoneId: "milestone-1" }),
      ).toBe("phase-2/milestone-1");
    });
  });

  describe("buildDecisionId", () => {
    it("builds project decision id with compact date and slug", () => {
      const id = buildDecisionId({ kind: "project" }, "tech-stack");
      expect(id).toMatch(/^project:\d{8}:tech-stack$/);
    });

    it("builds phase decision id", () => {
      const id = buildDecisionId({ kind: "phase", phaseId: "phase-2" }, "api-design");
      expect(id).toMatch(/^phase-2:\d{8}:api-design$/);
    });

    it("builds milestone decision id", () => {
      const id = buildDecisionId(
        { kind: "milestone", phaseId: "phase-2", milestoneId: "milestone-1" },
        "storage-strategy",
      );
      expect(id).toMatch(/^phase-2\/milestone-1:\d{8}:storage-strategy$/);
    });

    it("uses same date segment for calls within same run", () => {
      const a = buildDecisionId({ kind: "project" }, "a");
      const b = buildDecisionId({ kind: "project" }, "b");
      const dateA = a.split(":")[1];
      const dateB = b.split(":")[1];
      expect(dateA).toBe(dateB);
    });
  });
});
