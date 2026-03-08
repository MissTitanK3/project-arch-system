import { describe, it, expect } from "vitest";
import { milestoneManifestSchema, type MilestoneManifest } from "./milestone";

describe("schemas/milestone", () => {
  describe("milestoneManifestSchema", () => {
    const validManifest: MilestoneManifest = {
      schemaVersion: "1.0",
      id: "milestone-1",
      phaseId: "phase-1",
      createdAt: "2026-03-01",
      updatedAt: "2026-03-07",
    };

    it("should accept valid milestone manifest", () => {
      const result = milestoneManifestSchema.parse(validManifest);
      expect(result).toEqual(validManifest);
      expect(result.id).toBe("milestone-1");
      expect(result.phaseId).toBe("phase-1");
    });

    it("should accept manifest with same createdAt and updatedAt", () => {
      const sameDate = {
        ...validManifest,
        createdAt: "2026-03-07",
        updatedAt: "2026-03-07",
      };
      const result = milestoneManifestSchema.parse(sameDate);
      expect(result.createdAt).toBe(result.updatedAt);
    });

    it("should accept manifest with various valid IDs", () => {
      const validIds = ["milestone-1", "m1", "feature-v2", "release-candidate", "sprint-42"];

      for (const id of validIds) {
        const manifest = { ...validManifest, id };
        const result = milestoneManifestSchema.parse(manifest);
        expect(result.id).toBe(id);
      }
    });

    it("should reject manifest with invalid schemaVersion", () => {
      const invalid = { ...validManifest, schemaVersion: "2.0" };
      expect(() => milestoneManifestSchema.parse(invalid)).toThrow();
    });

    it("should reject manifest with missing required fields", () => {
      const missingId = Object.fromEntries(
        Object.entries(validManifest).filter(([key]) => key !== "id"),
      );
      expect(() => milestoneManifestSchema.parse(missingId)).toThrow();

      const missingPhaseId = Object.fromEntries(
        Object.entries(validManifest).filter(([key]) => key !== "phaseId"),
      );
      expect(() => milestoneManifestSchema.parse(missingPhaseId)).toThrow();

      const missingCreatedAt = Object.fromEntries(
        Object.entries(validManifest).filter(([key]) => key !== "createdAt"),
      );
      expect(() => milestoneManifestSchema.parse(missingCreatedAt)).toThrow();

      const missingUpdatedAt = Object.fromEntries(
        Object.entries(validManifest).filter(([key]) => key !== "updatedAt"),
      );
      expect(() => milestoneManifestSchema.parse(missingUpdatedAt)).toThrow();
    });

    it("should reject manifest with empty id", () => {
      const invalid = { ...validManifest, id: "" };
      expect(() => milestoneManifestSchema.parse(invalid)).toThrow();
    });

    it("should reject manifest with empty phaseId", () => {
      const invalid = { ...validManifest, phaseId: "" };
      expect(() => milestoneManifestSchema.parse(invalid)).toThrow();
    });

    describe("date validation", () => {
      it("should reject manifest with invalid createdAt format", () => {
        const invalidFormats = ["2026/03/07", "07-03-2026", "2026-3-7", "20260307", "invalid", ""];

        for (const format of invalidFormats) {
          const invalid = { ...validManifest, createdAt: format };
          expect(() => milestoneManifestSchema.parse(invalid)).toThrow();
        }
      });

      it("should reject manifest with invalid updatedAt format", () => {
        const invalidFormats = ["2026/03/07", "07-03-2026", "2026-3-7", "20260307", "invalid", ""];

        for (const format of invalidFormats) {
          const invalid = { ...validManifest, updatedAt: format };
          expect(() => milestoneManifestSchema.parse(invalid)).toThrow();
        }
      });

      it("should accept valid YYYY-MM-DD date formats", () => {
        const validDates = ["2026-01-01", "2026-12-31", "2026-03-07", "2000-01-01", "2099-12-31"];

        for (const date of validDates) {
          const manifest = {
            ...validManifest,
            createdAt: date,
            updatedAt: date,
          };
          const result = milestoneManifestSchema.parse(manifest);
          expect(result.createdAt).toBe(date);
          expect(result.updatedAt).toBe(date);
        }
      });

      it("should not validate date order (accepts updatedAt before createdAt)", () => {
        // Schema doesn't enforce date logic, just format
        const outOfOrder = {
          ...validManifest,
          createdAt: "2026-03-07",
          updatedAt: "2026-03-01",
        };
        const result = milestoneManifestSchema.parse(outOfOrder);
        expect(result).toBeDefined();
      });
    });

    describe("field types", () => {
      it("should reject non-string id", () => {
        expect(() => milestoneManifestSchema.parse({ ...validManifest, id: 123 })).toThrow();
        expect(() => milestoneManifestSchema.parse({ ...validManifest, id: null })).toThrow();
        expect(() => milestoneManifestSchema.parse({ ...validManifest, id: [] })).toThrow();
      });

      it("should reject non-string phaseId", () => {
        expect(() => milestoneManifestSchema.parse({ ...validManifest, phaseId: 123 })).toThrow();
        expect(() => milestoneManifestSchema.parse({ ...validManifest, phaseId: null })).toThrow();
      });

      it("should reject non-string dates", () => {
        expect(() =>
          milestoneManifestSchema.parse({ ...validManifest, createdAt: 20260307 }),
        ).toThrow();
        expect(() =>
          milestoneManifestSchema.parse({ ...validManifest, updatedAt: new Date() }),
        ).toThrow();
      });
    });

    describe("extra fields", () => {
      it("should strip unknown fields by default", () => {
        const withExtra = {
          ...validManifest,
          extraField: "should be removed",
          anotherField: 123,
        };
        const result = milestoneManifestSchema.parse(withExtra) as Record<string, unknown>;
        expect(result.extraField).toBeUndefined();
        expect(result.anotherField).toBeUndefined();
      });
    });

    describe("relationship scenarios", () => {
      it("should accept milestone with hyphenated IDs", () => {
        const manifest = {
          schemaVersion: "1.0" as const,
          id: "mvp-release",
          phaseId: "phase-beta",
          createdAt: "2026-03-01",
          updatedAt: "2026-03-07",
        };
        const result = milestoneManifestSchema.parse(manifest);
        expect(result.id).toBe("mvp-release");
        expect(result.phaseId).toBe("phase-beta");
      });

      it("should accept milestone with underscore-separated IDs", () => {
        const manifest = {
          schemaVersion: "1.0" as const,
          id: "feature_freeze",
          phaseId: "phase_2",
          createdAt: "2026-03-01",
          updatedAt: "2026-03-07",
        };
        const result = milestoneManifestSchema.parse(manifest);
        expect(result.id).toBe("feature_freeze");
        expect(result.phaseId).toBe("phase_2");
      });

      it("should accept milestone with alphanumeric IDs", () => {
        const manifest = {
          schemaVersion: "1.0" as const,
          id: "v2.0.0",
          phaseId: "q1-2026",
          createdAt: "2026-03-01",
          updatedAt: "2026-03-07",
        };
        const result = milestoneManifestSchema.parse(manifest);
        expect(result.id).toBe("v2.0.0");
        expect(result.phaseId).toBe("q1-2026");
      });
    });
  });
});
