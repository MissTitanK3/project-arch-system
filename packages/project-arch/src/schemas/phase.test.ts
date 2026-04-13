import { describe, it, expect } from "vitest";
import { phaseManifestSchema, type PhaseManifest } from "./phase";

describe("schemas/phase", () => {
  describe("phaseManifestSchema", () => {
    const validManifest: PhaseManifest = {
      schemaVersion: "2.0",
      phases: [
        { id: "phase-1", projectId: "shared", createdAt: "2026-03-01" },
        { id: "phase-2", projectId: "storefront", createdAt: "2026-03-07" },
      ],
      activeProject: "storefront",
      activePhase: "phase-2",
      activeMilestone: null,
    };

    it("should accept valid phase manifest", () => {
      const result = phaseManifestSchema.parse(validManifest);
      expect(result).toEqual(validManifest);
      expect(result.phases).toHaveLength(2);
      expect(result.activePhase).toBe("phase-2");
    });

    it("should accept manifest with null activePhase", () => {
      const withNull = { ...validManifest, activePhase: null };
      const result = phaseManifestSchema.parse(withNull);
      expect(result.activePhase).toBeNull();
    });

    it("should accept manifest with empty phases array", () => {
      const withEmptyPhases = {
        schemaVersion: "2.0" as const,
        phases: [],
        activeProject: null,
        activePhase: null,
        activeMilestone: null,
      };
      const result = phaseManifestSchema.parse(withEmptyPhases);
      expect(result.phases).toEqual([]);
    });

    it("should accept manifest with single phase", () => {
      const singlePhase = {
        schemaVersion: "2.0" as const,
        phases: [{ id: "phase-1", projectId: "shared", createdAt: "2026-03-07" }],
        activeProject: "shared",
        activePhase: "phase-1",
        activeMilestone: null,
      };
      const result = phaseManifestSchema.parse(singlePhase);
      expect(result.phases).toHaveLength(1);
    });

    it("should reject manifest with invalid schemaVersion", () => {
      const invalid = { ...validManifest, schemaVersion: "9.9" };
      expect(() => phaseManifestSchema.parse(invalid)).toThrow();
    });

    it("should reject manifest with missing schemaVersion", () => {
      const missing = Object.fromEntries(
        Object.entries(validManifest).filter(([key]) => key !== "schemaVersion"),
      );
      expect(() => phaseManifestSchema.parse(missing)).toThrow();
    });

    it("should reject manifest with missing phases", () => {
      const missing = Object.fromEntries(
        Object.entries(validManifest).filter(([key]) => key !== "phases"),
      );
      expect(() => phaseManifestSchema.parse(missing)).toThrow();
    });

    it("should reject manifest with missing activePhase", () => {
      const missing = Object.fromEntries(
        Object.entries(validManifest).filter(([key]) => key !== "activePhase"),
      );
      expect(() => phaseManifestSchema.parse(missing)).toThrow();
    });

    it("should reject manifest with non-array phases", () => {
      const invalid = { ...validManifest, phases: "phase-1" };
      expect(() => phaseManifestSchema.parse(invalid)).toThrow();
    });

    describe("phase entries", () => {
      it("should reject phase with empty id", () => {
        const invalid = {
          ...validManifest,
          phases: [{ id: "", projectId: "shared", createdAt: "2026-03-07" }],
        };
        expect(() => phaseManifestSchema.parse(invalid)).toThrow();
      });

      it("should reject phase with missing id", () => {
        const invalid = {
          ...validManifest,
          phases: [{ projectId: "shared", createdAt: "2026-03-07" }],
        };
        expect(() => phaseManifestSchema.parse(invalid)).toThrow();
      });

      it("should reject phase with missing createdAt", () => {
        const invalid = {
          ...validManifest,
          phases: [{ id: "phase-1", projectId: "shared" }],
        };
        expect(() => phaseManifestSchema.parse(invalid)).toThrow();
      });

      it("should reject phase with invalid date format", () => {
        // Must be YYYY-MM-DD
        const invalidFormats = ["2026/03/07", "07-03-2026", "2026-3-7", "20260307", "invalid", ""];

        for (const format of invalidFormats) {
          const invalid = {
            ...validManifest,
            phases: [{ id: "phase-1", projectId: "shared", createdAt: format }],
          };
          expect(() => phaseManifestSchema.parse(invalid)).toThrow();
        }
      });

      it("should accept valid date formats", () => {
        // Test various valid YYYY-MM-DD dates
        const validDates = ["2026-01-01", "2026-12-31", "2026-03-07", "2000-01-01", "2099-12-31"];

        for (const date of validDates) {
          const valid = {
            ...validManifest,
            phases: [{ id: "phase-1", projectId: "shared", createdAt: date }],
          };
          const result = phaseManifestSchema.parse(valid);
          expect(result.phases[0].createdAt).toBe(date);
        }
      });

      it("should default missing projectId to shared", () => {
        const valid = {
          ...validManifest,
          phases: [{ id: "phase-1", createdAt: "2026-03-07" }],
        };

        const result = phaseManifestSchema.parse(valid);
        expect(result.phases[0].projectId).toBe("shared");
      });
    });

    describe("activePhase field", () => {
      it("should accept string activePhase", () => {
        const result = phaseManifestSchema.parse(validManifest);
        expect(typeof result.activePhase).toBe("string");
      });

      it("should accept null activePhase", () => {
        const withNull = { ...validManifest, activePhase: null };
        const result = phaseManifestSchema.parse(withNull);
        expect(result.activePhase).toBeNull();
      });

      it("should reject undefined activePhase", () => {
        const missing = Object.fromEntries(
          Object.entries(validManifest).filter(([key]) => key !== "activePhase"),
        );
        expect(() => phaseManifestSchema.parse(missing)).toThrow();
      });

      it("should reject non-string, non-null activePhase", () => {
        expect(() => phaseManifestSchema.parse({ ...validManifest, activePhase: 123 })).toThrow();
        expect(() => phaseManifestSchema.parse({ ...validManifest, activePhase: true })).toThrow();
        expect(() => phaseManifestSchema.parse({ ...validManifest, activePhase: [] })).toThrow();
      });
    });

    describe("activeMilestone field", () => {
      it("should accept string activeMilestone", () => {
        const withMilestone = { ...validManifest, activeMilestone: "milestone-1-foundation" };
        const result = phaseManifestSchema.parse(withMilestone);
        expect(typeof result.activeMilestone).toBe("string");
        expect(result.activeMilestone).toBe("milestone-1-foundation");
      });

      it("should accept null activeMilestone", () => {
        const withNull = { ...validManifest, activeMilestone: null };
        const result = phaseManifestSchema.parse(withNull);
        expect(result.activeMilestone).toBeNull();
      });

      it("should accept undefined activeMilestone and default to null", () => {
        const missing = Object.fromEntries(
          Object.entries(validManifest).filter(([key]) => key !== "activeMilestone"),
        );
        const result = phaseManifestSchema.parse(missing);
        expect(result.activeMilestone).toBeNull();
      });

      it("should reject non-string, non-null activeMilestone", () => {
        expect(() =>
          phaseManifestSchema.parse({ ...validManifest, activeMilestone: 123 }),
        ).toThrow();
        expect(() =>
          phaseManifestSchema.parse({ ...validManifest, activeMilestone: true }),
        ).toThrow();
        expect(() =>
          phaseManifestSchema.parse({ ...validManifest, activeMilestone: [] }),
        ).toThrow();
      });
    });

    describe("activeProject field", () => {
      it("should accept string activeProject", () => {
        const result = phaseManifestSchema.parse(validManifest);
        expect(result.activeProject).toBe("storefront");
      });

      it("should accept null activeProject", () => {
        const result = phaseManifestSchema.parse({ ...validManifest, activeProject: null });
        expect(result.activeProject).toBeNull();
      });

      it("should default missing activeProject to null", () => {
        const missing = Object.fromEntries(
          Object.entries(validManifest).filter(([key]) => key !== "activeProject"),
        );
        const result = phaseManifestSchema.parse(missing);
        expect(result.activeProject).toBeNull();
      });
    });

    describe("multiple phases", () => {
      it("should handle many phases", () => {
        const manyPhases = {
          schemaVersion: "2.0" as const,
          phases: Array.from({ length: 10 }, (_, i) => ({
            id: `phase-${i + 1}`,
            projectId: i < 5 ? "shared" : "storefront",
            createdAt: "2026-03-07",
          })),
          activeProject: "storefront",
          activePhase: "phase-10",
          activeMilestone: null,
        };

        const result = phaseManifestSchema.parse(manyPhases);
        expect(result.phases).toHaveLength(10);
        expect(result.phases[0].id).toBe("phase-1");
        expect(result.phases[9].id).toBe("phase-10");
      });

      it("should preserve phase order", () => {
        const ordered = {
          schemaVersion: "2.0" as const,
          phases: [
            { id: "alpha", projectId: "shared", createdAt: "2026-03-01" },
            { id: "beta", projectId: "shared", createdAt: "2026-03-02" },
            { id: "gamma", projectId: "storefront", createdAt: "2026-03-03" },
          ],
          activeProject: null,
          activePhase: null,
          activeMilestone: null,
        };

        const result = phaseManifestSchema.parse(ordered);
        expect(result.phases[0].id).toBe("alpha");
        expect(result.phases[1].id).toBe("beta");
        expect(result.phases[2].id).toBe("gamma");
      });
    });
  });
});
