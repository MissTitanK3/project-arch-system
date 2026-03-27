import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { writeJsonDeterministic } from "../../utils/fs";
import { checkDomains } from "./checkDomains";
import { TaskRecord } from "../../core/validation/tasks";

function taskRecord(tags: string[], codeTargets: string[]): TaskRecord {
  return {
    projectId: "shared",
    phaseId: "phase-1",
    milestoneId: "milestone-1",
    lane: "planned",
    filePath: "roadmap/projects/shared/phases/phase-1/milestones/milestone-1/tasks/planned/001-task.md",
    frontmatter: {
      schemaVersion: "1.0",
      id: "001",
      slug: "task",
      title: "Task",
      lane: "planned",
      status: "todo",
      createdAt: "2026-03-07",
      updatedAt: "2026-03-07",
      discoveredFromTask: null,
      tags,
      codeTargets,
      publicDocs: [],
      decisions: [],
      completionCriteria: [],
    },
  };
}

describe("graph/drift/checkDomains", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "drift-domains-test-"));
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("should warn when arch-domains/domains.json is missing", async () => {
    const findings = await checkDomains(tempDir, []);

    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("ARCH_DOMAINS_MISSING");
    expect(findings[0].severity).toBe("warning");
  });

  it("should report domain violations when target module is outside ownedPackages", async () => {
    await writeJsonDeterministic(path.join(tempDir, "arch-domains", "domains.json"), {
      domains: [{ name: "payments", ownedPackages: ["packages/payments"] }],
    });

    const findings = await checkDomains(tempDir, [
      taskRecord(["domain:payments"], ["packages/orders/src/service.ts"]),
    ]);

    expect(findings.some((f) => f.code === "DOMAIN_VIOLATION")).toBe(true);
    expect(findings[0].severity).toBe("error");
  });

  it("should pass when domain-tagged task targets owned package", async () => {
    await writeJsonDeterministic(path.join(tempDir, "arch-domains", "domains.json"), {
      domains: [{ name: "payments", ownedPackages: ["packages/payments"] }],
    });

    const findings = await checkDomains(tempDir, [
      taskRecord(["domain:payments"], ["packages/payments/src/service.ts"]),
    ]);

    expect(findings).toEqual([]);
  });
});
