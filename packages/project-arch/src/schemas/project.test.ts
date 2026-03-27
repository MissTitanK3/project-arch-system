import { describe, it, expect } from "vitest";
import {
  projectManifestSchema,
  projectTypeSchema,
  type ProjectManifest,
} from "./project";

describe("schemas/project", () => {
  describe("projectTypeSchema", () => {
    it("accepts supported project types", () => {
      for (const type of ["application", "service", "package", "client", "shared"] as const) {
        expect(projectTypeSchema.parse(type)).toBe(type);
      }
    });

    it("rejects unsupported project types", () => {
      expect(() => projectTypeSchema.parse("library")).toThrow();
    });
  });

  describe("projectManifestSchema", () => {
    const validManifest: ProjectManifest = {
      schemaVersion: "1.0",
      id: "storefront",
      title: "Storefront",
      type: "application",
      summary: "Customer-facing commerce experience.",
      ownedPaths: ["apps/storefront"],
      sharedDependencies: ["packages/ui", "services/auth"],
      defaultPhase: "phase-1-delivery",
      tags: ["customer", "commerce"],
    };

    it("accepts a valid project manifest", () => {
      const result = projectManifestSchema.parse(validManifest);
      expect(result).toEqual(validManifest);
    });

    it("requires the core project identity fields", () => {
      for (const key of ["id", "title", "type", "summary", "ownedPaths"] as const) {
        const manifest = Object.fromEntries(
          Object.entries(validManifest).filter(([entryKey]) => entryKey !== key),
        );
        expect(() => projectManifestSchema.parse(manifest)).toThrow();
      }
    });

    it("rejects empty required string fields", () => {
      expect(() => projectManifestSchema.parse({ ...validManifest, id: "" })).toThrow();
      expect(() => projectManifestSchema.parse({ ...validManifest, title: "" })).toThrow();
      expect(() => projectManifestSchema.parse({ ...validManifest, summary: "" })).toThrow();
    });

    it("requires at least one owned path", () => {
      expect(() => projectManifestSchema.parse({ ...validManifest, ownedPaths: [] })).toThrow();
    });

    it("rejects empty owned path and dependency entries", () => {
      expect(() =>
        projectManifestSchema.parse({ ...validManifest, ownedPaths: ["apps/storefront", ""] })
      ).toThrow();
      expect(() =>
        projectManifestSchema.parse({
          ...validManifest,
          sharedDependencies: ["packages/ui", ""],
        })
      ).toThrow();
    });

    it("accepts omitted optional fields and applies defaults", () => {
      const result = projectManifestSchema.parse({
        schemaVersion: "1.0",
        id: "shared",
        title: "Shared",
        type: "shared",
        summary: "Cross-cutting work.",
        ownedPaths: ["roadmap", "architecture"],
      });

      expect(result.sharedDependencies).toEqual([]);
      expect(result.tags).toEqual([]);
      expect(result.defaultPhase).toBeUndefined();
    });

    it("rejects invalid schemaVersion", () => {
      expect(() => projectManifestSchema.parse({ ...validManifest, schemaVersion: "2.0" })).toThrow();
    });

    it("strips unknown fields", () => {
      const result = projectManifestSchema.parse({
        ...validManifest,
        unexpected: true,
      }) as Record<string, unknown>;

      expect(result.unexpected).toBeUndefined();
    });
  });
});
