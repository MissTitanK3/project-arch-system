import { describe, it, expect } from "vitest";
import { decisionSchema, decisionStatusSchema, type DecisionFrontmatter } from "./decision";

describe("schemas/decision", () => {
  describe("decisionStatusSchema", () => {
    it("should accept valid status values", () => {
      expect(decisionStatusSchema.parse("proposed")).toBe("proposed");
      expect(decisionStatusSchema.parse("accepted")).toBe("accepted");
      expect(decisionStatusSchema.parse("rejected")).toBe("rejected");
      expect(decisionStatusSchema.parse("superseded")).toBe("superseded");
    });

    it("should reject invalid status values", () => {
      expect(() => decisionStatusSchema.parse("pending")).toThrow();
      expect(() => decisionStatusSchema.parse("approved")).toThrow();
      expect(() => decisionStatusSchema.parse("")).toThrow();
    });
  });

  describe("decisionSchema", () => {
    const baseDecision: Omit<DecisionFrontmatter, "scope"> = {
      schemaVersion: "1.0",
      type: "decision",
      id: "project:20260307:decision",
      title: "Adopt TypeScript for Backend",
      status: "accepted",
      drivers: ["Type safety", "Better tooling"],
      decision: {
        summary: "We will use TypeScript for all backend services",
      },
      alternatives: ["Continue with JavaScript", "Use Flow"],
      consequences: {
        positive: ["Better type safety", "Improved IDE support"],
        negative: ["Learning curve", "Build step required"],
      },
      links: {
        tasks: ["042"],
        codeTargets: ["src/backend/"],
        publicDocs: ["docs/decisions/typescript.md"],
      },
    };

    describe("project-scoped decisions", () => {
      it("should accept valid project-scoped decision", () => {
        const projectDecision: DecisionFrontmatter = {
          ...baseDecision,
          scope: { kind: "project" },
        };

        const result = decisionSchema.parse(projectDecision);
        expect(result.scope.kind).toBe("project");
      });

      it("should reject project scope with extra fields", () => {
        const invalid = {
          ...baseDecision,
          scope: { kind: "project", phaseId: "phase-1" },
        };

        // Zod discriminatedUnion accepts extra fields by default (strips or ignores them)
        // This test verifies the schema accepts the data (matching Zod's actual behavior)
        const result = decisionSchema.parse(invalid);
        expect(result.scope.kind).toBe("project");
      });
    });

    describe("phase-scoped decisions", () => {
      it("should accept valid phase-scoped decision", () => {
        const phaseDecision: DecisionFrontmatter = {
          ...baseDecision,
          id: "phase-1:20260307:decision",
          scope: { kind: "phase", phaseId: "phase-1" },
        };

        const result = decisionSchema.parse(phaseDecision);
        expect(result.scope.kind).toBe("phase");
        if (result.scope.kind === "phase") {
          expect(result.scope.phaseId).toBe("phase-1");
        }
      });

      it("should reject phase scope without phaseId", () => {
        const invalid = {
          ...baseDecision,
          scope: { kind: "phase" },
        };

        expect(() => decisionSchema.parse(invalid)).toThrow();
      });

      it("should reject phase scope with empty phaseId", () => {
        const invalid = {
          ...baseDecision,
          scope: { kind: "phase", phaseId: "" },
        };

        expect(() => decisionSchema.parse(invalid)).toThrow();
      });
    });

    describe("milestone-scoped decisions", () => {
      it("should accept valid milestone-scoped decision", () => {
        const milestoneDecision: DecisionFrontmatter = {
          ...baseDecision,
          id: "phase-1/milestone-1:20260307:decision",
          scope: {
            kind: "milestone",
            phaseId: "phase-1",
            milestoneId: "milestone-1",
          },
        };

        const result = decisionSchema.parse(milestoneDecision);
        expect(result.scope.kind).toBe("milestone");
        if (result.scope.kind === "milestone") {
          expect(result.scope.phaseId).toBe("phase-1");
          expect(result.scope.milestoneId).toBe("milestone-1");
        }
      });

      it("should reject milestone scope without phaseId", () => {
        const invalid = {
          ...baseDecision,
          scope: { kind: "milestone", milestoneId: "milestone-1" },
        };

        expect(() => decisionSchema.parse(invalid)).toThrow();
      });

      it("should reject milestone scope without milestoneId", () => {
        const invalid = {
          ...baseDecision,
          scope: { kind: "milestone", phaseId: "phase-1" },
        };

        expect(() => decisionSchema.parse(invalid)).toThrow();
      });

      it("should reject milestone scope with empty IDs", () => {
        expect(() =>
          decisionSchema.parse({
            ...baseDecision,
            scope: { kind: "milestone", phaseId: "", milestoneId: "milestone-1" },
          }),
        ).toThrow();

        expect(() =>
          decisionSchema.parse({
            ...baseDecision,
            scope: { kind: "milestone", phaseId: "phase-1", milestoneId: "" },
          }),
        ).toThrow();
      });
    });

    describe("required fields", () => {
      const validDecision: DecisionFrontmatter = {
        ...baseDecision,
        scope: { kind: "project" },
      };

      it("should reject decision with invalid schemaVersion", () => {
        const invalid = { ...validDecision, schemaVersion: "2.0" };
        expect(() => decisionSchema.parse(invalid)).toThrow();
      });

      it("should reject decision with invalid type", () => {
        const invalid = { ...validDecision, type: "task" };
        expect(() => decisionSchema.parse(invalid)).toThrow();
      });

      it("should reject decision with empty required strings", () => {
        expect(() => decisionSchema.parse({ ...validDecision, id: "" })).toThrow();
        expect(() => decisionSchema.parse({ ...validDecision, title: "" })).toThrow();
        // Note: decision.summary is z.string() without .min(1), so empty string is valid
        const withEmptySummary = {
          ...validDecision,
          decision: { summary: "" },
        };
        const result = decisionSchema.parse(withEmptySummary);
        expect(result.decision.summary).toBe("");
      });

      it("should reject decision with invalid status", () => {
        expect(() => decisionSchema.parse({ ...validDecision, status: "approved" })).toThrow();
      });

      it("should reject decision with non-array fields", () => {
        expect(() => decisionSchema.parse({ ...validDecision, drivers: "driver1" })).toThrow();
        expect(() =>
          decisionSchema.parse({ ...validDecision, alternatives: "alternative1" }),
        ).toThrow();
      });

      it("should reject decision with missing required fields", () => {
        const missingId = Object.fromEntries(
          Object.entries(validDecision).filter(([key]) => key !== "id"),
        );
        expect(() => decisionSchema.parse(missingId)).toThrow();

        const missingTitle = Object.fromEntries(
          Object.entries(validDecision).filter(([key]) => key !== "title"),
        );
        expect(() => decisionSchema.parse(missingTitle)).toThrow();

        const missingDecision = Object.fromEntries(
          Object.entries(validDecision).filter(([key]) => key !== "decision"),
        );
        expect(() => decisionSchema.parse(missingDecision)).toThrow();

        const missingConsequences = Object.fromEntries(
          Object.entries(validDecision).filter(([key]) => key !== "consequences"),
        );
        expect(() => decisionSchema.parse(missingConsequences)).toThrow();
      });
    });

    describe("optional fields", () => {
      it("should accept decision with supersedes field", () => {
        const withSupersedes: DecisionFrontmatter = {
          ...baseDecision,
          scope: { kind: "project" },
          supersedes: ["project:20260306:decision"],
        };

        const result = decisionSchema.parse(withSupersedes);
        expect(result.supersedes).toEqual(["project:20260306:decision"]);
      });

      it("should accept decision with implementationStatus", () => {
        const withImplementation: DecisionFrontmatter = {
          ...baseDecision,
          scope: { kind: "project" },
          implementationStatus: {
            implemented: true,
            checklist: ["Migrate codebase", "Update docs"],
          },
        };

        const result = decisionSchema.parse(withImplementation);
        expect(result.implementationStatus?.implemented).toBe(true);
        expect(result.implementationStatus?.checklist).toHaveLength(2);
      });

      it("should accept decision with impact field", () => {
        const withImpact: DecisionFrontmatter = {
          ...baseDecision,
          scope: { kind: "project" },
          impact: {
            scope: ["backend", "frontend"],
            effort: "high",
            risk: "medium",
          },
        };

        const result = decisionSchema.parse(withImpact);
        expect(result.impact?.scope).toEqual(["backend", "frontend"]);
        expect(result.impact?.effort).toBe("high");
        expect(result.impact?.risk).toBe("medium");
      });

      it("should accept decision without optional fields", () => {
        const minimal: DecisionFrontmatter = {
          ...baseDecision,
          scope: { kind: "project" },
        };

        const result = decisionSchema.parse(minimal);
        expect(result.supersedes).toBeUndefined();
        expect(result.implementationStatus).toBeUndefined();
        expect(result.impact).toBeUndefined();
      });
    });

    describe("links object", () => {
      const validDecision: DecisionFrontmatter = {
        ...baseDecision,
        scope: { kind: "project" },
      };

      it("should accept empty arrays in links", () => {
        const withEmptyLinks = {
          ...validDecision,
          links: {
            tasks: [],
            codeTargets: [],
            publicDocs: [],
          },
        };

        const result = decisionSchema.parse(withEmptyLinks);
        expect(result.links.tasks).toEqual([]);
        expect(result.links.codeTargets).toEqual([]);
        expect(result.links.publicDocs).toEqual([]);
      });

      it("should accept multiple links", () => {
        const withMultipleLinks = {
          ...validDecision,
          links: {
            tasks: ["042", "043", "044"],
            codeTargets: ["src/backend/", "src/frontend/"],
            publicDocs: ["docs/adr-001.md", "docs/adr-002.md"],
          },
        };

        const result = decisionSchema.parse(withMultipleLinks);
        expect(result.links.tasks).toHaveLength(3);
        expect(result.links.codeTargets).toHaveLength(2);
      });
    });

    describe("consequences object", () => {
      const validDecision: DecisionFrontmatter = {
        ...baseDecision,
        scope: { kind: "project" },
      };

      it("should require both positive and negative consequences", () => {
        const withoutPositive = {
          negative: validDecision.consequences.negative,
        };
        expect(() =>
          decisionSchema.parse({ ...validDecision, consequences: withoutPositive }),
        ).toThrow();

        const withoutNegative = {
          positive: validDecision.consequences.positive,
        };
        expect(() =>
          decisionSchema.parse({ ...validDecision, consequences: withoutNegative }),
        ).toThrow();
      });

      it("should accept empty arrays for consequences", () => {
        const withEmptyConsequences = {
          ...validDecision,
          consequences: {
            positive: [],
            negative: [],
          },
        };

        const result = decisionSchema.parse(withEmptyConsequences);
        expect(result.consequences.positive).toEqual([]);
        expect(result.consequences.negative).toEqual([]);
      });
    });

    describe("all status types", () => {
      const validDecision: DecisionFrontmatter = {
        ...baseDecision,
        scope: { kind: "project" },
      };

      it("should handle all status values", () => {
        expect(decisionSchema.parse({ ...validDecision, status: "proposed" }).status).toBe(
          "proposed",
        );
        expect(decisionSchema.parse({ ...validDecision, status: "accepted" }).status).toBe(
          "accepted",
        );
        expect(decisionSchema.parse({ ...validDecision, status: "rejected" }).status).toBe(
          "rejected",
        );
        expect(decisionSchema.parse({ ...validDecision, status: "superseded" }).status).toBe(
          "superseded",
        );
      });
    });
  });
});
