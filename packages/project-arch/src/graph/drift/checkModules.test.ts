import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { writeJsonDeterministic } from "../../utils/fs";
import { checkModules } from "./checkModules";
import { DecisionRecord } from "../../core/validation/decisions";

function decisionRecord(codeTargets: string[]): DecisionRecord {
  return {
    filePath: "roadmap/decisions/test.md",
    frontmatter: {
      schemaVersion: "2.0",
      type: "decision",
      id: "project:20260307:test",
      title: "Test Decision",
      status: "accepted",
      scope: { kind: "project" },
      drivers: [],
      decision: { summary: "summary" },
      alternatives: [],
      consequences: { positive: [], negative: [] },
      links: { tasks: [], codeTargets, publicDocs: [] },
    },
  };
}

describe("graph/drift/checkModules", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "drift-modules-test-"));
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("should warn when arch-model/modules.json is missing", async () => {
    const findings = await checkModules(tempDir, []);

    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ARCH_MAP_MISSING");
    expect(findings[0].severity).toBe("warning");
  });

  it("should report unmapped modules and missing architecture decisions", async () => {
    await mkdir(path.join(tempDir, "apps", "web"), { recursive: true });
    await mkdir(path.join(tempDir, "packages", "ui"), { recursive: true });

    await writeJsonDeterministic(path.join(tempDir, "arch-model", "modules.json"), {
      modules: [{ name: "apps/web", owner: "team-a" }],
    });

    const findings = await checkModules(tempDir, []);

    expect(
      findings.some((f) => f.code === "UNMAPPED_MODULE" && f.message.includes("packages/ui")),
    ).toBe(true);
    expect(
      findings.some(
        (f) => f.code === "MISSING_ARCHITECTURE_DECISION" && f.message.includes("packages/ui"),
      ),
    ).toBe(true);
  });

  it("should skip missing-decision error when module is covered by decision codeTarget", async () => {
    await mkdir(path.join(tempDir, "packages", "api"), { recursive: true });

    await writeJsonDeterministic(path.join(tempDir, "arch-model", "modules.json"), {
      modules: [],
    });

    const findings = await checkModules(tempDir, [decisionRecord(["packages/api/src"])]);
    expect(
      findings.some((f) => f.code === "UNMAPPED_MODULE" && f.message.includes("packages/api")),
    ).toBe(true);
    expect(
      findings.some(
        (f) => f.code === "MISSING_ARCHITECTURE_DECISION" && f.message.includes("packages/api"),
      ),
    ).toBe(false);
  });
});
