import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  decisionCreate,
  decisionLink,
  decisionStatus,
  decisionSupersede,
  decisionList,
} from "./decisions";
import { phaseCreate } from "./phases";
import { milestoneCreate } from "./milestones";
import { taskCreate } from "./tasks";
import { createTestProject, resultAssertions, type TestProjectContext } from "../test/helpers";

function extractDecisionIdFromPath(decisionPath: string): string {
  const match = decisionPath.match(/\/([^/]+)\.md$/);
  if (!match) {
    throw new Error(`Could not extract decision id from path: ${decisionPath}`);
  }
  return match[1];
}

describe.sequential("SDK Decisions", () => {
  let context: TestProjectContext;
  let testDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    testDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  describe("decisionCreate", () => {
    it("should create a project-scoped decision", async () => {
      const result = await decisionCreate({
        scope: "project",
        slug: "tech-stack",
        title: "Technology Stack Selection",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toBeDefined();
      expect(result.data.path).toContain("project");
      expect(result.data.path).toContain("tech-stack");
    });

    it("should create a phase-scoped decision", async () => {
      await phaseCreate({ id: "phase-1", cwd: testDir });

      const result = await decisionCreate({
        scope: "phase",
        phase: "phase-1",
        slug: "phase-architecture",
        title: "Phase Architecture",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("phase");
    });

    it("should create a milestone-scoped decision", async () => {
      await phaseCreate({ id: "phase-1", cwd: testDir });
      await milestoneCreate({ phase: "phase-1", milestone: "m1", cwd: testDir });

      const result = await decisionCreate({
        scope: "milestone",
        phase: "phase-1",
        milestone: "m1",
        slug: "api-design",
        title: "API Design Approach",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("phase-1");
      expect(result.data.path).toContain("m1:");
    });

    it("should create multiple decisions with incremented IDs", async () => {
      const result1 = await decisionCreate({
        scope: "project",
        slug: "decision-1",
        title: "Decision 1",
        cwd: testDir,
      });
      const result2 = await decisionCreate({
        scope: "project",
        slug: "decision-2",
        title: "Decision 2",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result1);
      resultAssertions.assertSuccess(result2);
      expect(result1.data.path).not.toBe(result2.data.path);
      expect(result1.data.path).toContain("decision-1");
      expect(result2.data.path).toContain("decision-2");
    });

    it("should default to project scope", async () => {
      const result = await decisionCreate({
        slug: "default-scope",
        title: "Default Scope Test",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.path).toContain("project");
    });

    it("should fail for phase scope without phase ID", async () => {
      const result = await decisionCreate({
        scope: "phase",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });

    it("should fail for milestone scope without milestone ID", async () => {
      await phaseCreate({ id: "phase-1", cwd: testDir });

      const result = await decisionCreate({
        scope: "milestone",
        phase: "phase-1",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("decisionLink", () => {
    it("should link decision to task", async () => {
      await phaseCreate({ id: "phase-1", cwd: testDir });
      await milestoneCreate({ phase: "phase-1", milestone: "m1", cwd: testDir });
      await taskCreate({ phase: "phase-1", milestone: "m1", cwd: testDir });

      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionLink({
        decisionId,
        task: "phase-1/m1/001",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.decisionId).toBe(decisionId);
    }, 15000);

    it("should link decision to code file", async () => {
      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionLink({
        decisionId,
        code: "src/auth/index.ts",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
    });

    it("should link decision to documentation", async () => {
      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionLink({
        decisionId,
        doc: "architecture/auth.md",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
    });

    it("should link decision to multiple targets", async () => {
      await phaseCreate({ id: "phase-1", cwd: testDir });
      await milestoneCreate({ phase: "phase-1", milestone: "m1", cwd: testDir });
      await taskCreate({ phase: "phase-1", milestone: "m1", cwd: testDir });
      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionLink({
        decisionId,
        task: "phase-1/m1/001",
        code: "src/auth.ts",
        doc: "architecture/auth.md",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
    });

    it("should fail for nonexistent decision", async () => {
      const result = await decisionLink({
        decisionId: "999",
        code: "src/test.ts",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("decisionStatus", () => {
    it("should update decision status to accepted", async () => {
      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionStatus({
        decisionId,
        status: "accepted",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.status).toBe("accepted");
      expect(result.data.decisionId).toBe(decisionId);
    });

    it("should update decision status to rejected", async () => {
      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionStatus({
        decisionId,
        status: "rejected",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.status).toBe("rejected");
    });

    it("should update decision status to superseded", async () => {
      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionStatus({
        decisionId,
        status: "superseded",
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.status).toBe("superseded");
    });

    it("should fail for nonexistent decision", async () => {
      const result = await decisionStatus({
        decisionId: "999",
        status: "accepted",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });

    it("should fail for invalid status value", async () => {
      const created = await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(created);
      const decisionId = extractDecisionIdFromPath(created.data.path);

      const result = await decisionStatus({
        decisionId,
        status: "invalid-status",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("decisionSupersede", () => {
    it("should mark one decision as superseding another", async () => {
      const first = await decisionCreate({
        scope: "project",
        slug: "old-decision",
        title: "Old Decision",
        cwd: testDir,
      });
      const second = await decisionCreate({
        scope: "project",
        slug: "new-decision",
        title: "New Decision",
        cwd: testDir,
      });
      resultAssertions.assertSuccess(first);
      resultAssertions.assertSuccess(second);
      const supersededDecisionId = extractDecisionIdFromPath(first.data.path);
      const decisionId = extractDecisionIdFromPath(second.data.path);

      const result = await decisionSupersede({
        decisionId,
        supersededDecisionId,
        cwd: testDir,
      });

      resultAssertions.assertSuccess(result);
      expect(result.data.decisionId).toBe(decisionId);
      expect(result.data.supersededDecisionId).toBe(supersededDecisionId);
    });

    it("should fail if superseding decision does not exist", async () => {
      await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });

      const result = await decisionSupersede({
        decisionId: "999",
        supersededDecisionId: "001",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });

    it("should fail if superseded decision does not exist", async () => {
      await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });

      const result = await decisionSupersede({
        decisionId: "001",
        supersededDecisionId: "999",
        cwd: testDir,
      });

      resultAssertions.assertError(result);
    });
  });

  describe("decisionList", () => {
    it("should list decisions in empty project", async () => {
      const result = await decisionList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should list created decisions", async () => {
      await decisionCreate({
        scope: "project",
        slug: "decision-1",
        title: "Decision 1",
        cwd: testDir,
      });
      await decisionCreate({
        scope: "project",
        slug: "decision-2",
        title: "Decision 2",
        cwd: testDir,
      });

      const result = await decisionList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      const ids = result.data.map((d) => d.id);
      expect(ids.some((id) => id.includes("decision-1"))).toBe(true);
      expect(ids.some((id) => id.includes("decision-2"))).toBe(true);
    });

    it("should include status for each decision", async () => {
      await decisionCreate({
        scope: "project",
        slug: "test",
        title: "Test",
        cwd: testDir,
      });

      const result = await decisionList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      result.data.forEach((decision) => {
        expect(decision).toHaveProperty("id");
        expect(decision).toHaveProperty("status");
        expect(["proposed", "accepted", "rejected", "superseded"]).toContain(decision.status);
      });
    });

    it("should list decisions across all scopes", async () => {
      await phaseCreate({ id: "phase-1", cwd: testDir });
      await milestoneCreate({ phase: "phase-1", milestone: "m1", cwd: testDir });

      await decisionCreate({
        scope: "project",
        slug: "project-decision",
        title: "Project Decision",
        cwd: testDir,
      });
      await decisionCreate({
        scope: "phase",
        phase: "phase-1",
        slug: "phase-decision",
        title: "Phase Decision",
        cwd: testDir,
      });
      await decisionCreate({
        scope: "milestone",
        phase: "phase-1",
        milestone: "m1",
        slug: "milestone-decision",
        title: "Milestone Decision",
        cwd: testDir,
      });

      const result = await decisionList({ cwd: testDir });

      resultAssertions.assertSuccess(result);
      expect(result.data.length).toBeGreaterThanOrEqual(3);
    });
  });
});
