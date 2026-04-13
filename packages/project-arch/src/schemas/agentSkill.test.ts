import { describe, expect, it } from "vitest";
import { agentSkillSchema } from "./agentSkill";
import { agentSkillRegistrySchema } from "./agentSkillRegistry";

describe("schemas/agentSkill", () => {
  const validSkill = {
    schemaVersion: "2.0" as const,
    id: "repo-map",
    name: "Repository Map",
    source: "builtin" as const,
    version: "1.0.0",
    summary: "Map repository architecture surfaces and authority order.",
    whenToUse: ["At task start"],
    expectedOutputs: ["Surface map summary"],
    files: {
      system: "system.md",
      checklist: "checklist.md",
    },
    tags: ["architecture"],
    overrides: false,
  };

  it("accepts a valid skill manifest", () => {
    const parsed = agentSkillSchema.parse(validSkill);
    expect(parsed).toEqual(validSkill);
  });

  it("defaults overrides to false when omitted", () => {
    const parsed = agentSkillSchema.parse({
      ...validSkill,
      source: "user",
      overrides: undefined,
    });
    expect(parsed.overrides).toBe(false);
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() =>
      agentSkillSchema.parse({
        ...validSkill,
        schemaVersion: "9.9",
      }),
    ).toThrow();
  });

  it("rejects missing required keys", () => {
    const missing = Object.fromEntries(
      Object.entries(validSkill).filter(([key]) => key !== "name"),
    );
    expect(() => agentSkillSchema.parse(missing)).toThrow();
  });

  it("rejects wrong field types", () => {
    expect(() =>
      agentSkillSchema.parse({
        ...validSkill,
        whenToUse: "At task start",
      }),
    ).toThrow();

    expect(() =>
      agentSkillSchema.parse({
        ...validSkill,
        overrides: "false",
      }),
    ).toThrow();
  });

  it("rejects invalid enum values", () => {
    expect(() =>
      agentSkillSchema.parse({
        ...validSkill,
        source: "core",
      }),
    ).toThrow();
  });

  it("rejects non-kebab-case id with actionable message", () => {
    expect(() =>
      agentSkillSchema.parse({
        ...validSkill,
        id: "RepoMap",
      }),
    ).toThrow(/kebab-case/i);
  });

  it("rejects invalid semver with actionable message", () => {
    expect(() =>
      agentSkillSchema.parse({
        ...validSkill,
        version: "2.0",
      }),
    ).toThrow(/semver/i);
  });
});

describe("schemas/agentSkillRegistry", () => {
  const validRegistry = {
    schemaVersion: "2.0" as const,
    generatedAt: "2026-03-22T00:00:00Z",
    skills: [
      {
        id: "repo-map",
        source: "builtin" as const,
        name: "Repository Map",
        version: "1.0.0",
        summary: "Map repository architecture surfaces and authority order.",
        directory: ".arch/agents-of-arch/skills/repo-map",
        files: {
          system: "system.md",
          checklist: "checklist.md",
        },
        tags: ["architecture"],
        overrides: false,
      },
      {
        id: "verification-plan",
        source: "builtin" as const,
        name: "Verification Plan",
        version: "1.0.0",
        summary: "Define deterministic validation and preflight steps.",
        directory: ".arch/agents-of-arch/skills/verification-plan",
        files: {
          system: "system.md",
          checklist: "checklist.md",
        },
        tags: ["verification"],
        overrides: false,
      },
    ],
  };

  it("accepts a valid registry", () => {
    const parsed = agentSkillRegistrySchema.parse(validRegistry);
    expect(parsed.skills).toHaveLength(2);
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() =>
      agentSkillRegistrySchema.parse({
        ...validRegistry,
        schemaVersion: "9.9",
      }),
    ).toThrow();
  });

  it("rejects invalid generatedAt values", () => {
    expect(() =>
      agentSkillRegistrySchema.parse({
        ...validRegistry,
        generatedAt: "2026-03-22",
      }),
    ).toThrow();
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      agentSkillRegistrySchema.parse({
        ...validRegistry,
        skills: [validRegistry.skills[0], validRegistry.skills[0]],
      }),
    ).toThrow(/Duplicate skill id/i);
  });

  it("rejects unsorted skill ids", () => {
    const unsorted = {
      ...validRegistry,
      skills: [...validRegistry.skills].reverse(),
    };

    expect(() => agentSkillRegistrySchema.parse(unsorted)).toThrow(/sorted by id/i);
  });

  it("rejects invalid enum values in entries", () => {
    expect(() =>
      agentSkillRegistrySchema.parse({
        ...validRegistry,
        skills: [
          {
            ...validRegistry.skills[0],
            source: "core",
          },
        ],
      }),
    ).toThrow();
  });
});
