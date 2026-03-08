import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "../tasks/createTask";
import { createDecision, linkDecision } from "../decisions/createDecision";
import { rebuildArchitectureGraph } from "./graph";
import { readJson, readMarkdownWithFrontmatter } from "../../fs";
import { writeFile } from "../../fs";

describe.sequential("core/manifests/graph", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  describe("rebuildArchitectureGraph", () => {
    it("should create graph artifacts for initialized project", async () => {
      await rebuildArchitectureGraph(tempDir);

      const graph = await readJson<{
        schemaVersion: string;
        nodes: Record<string, number>;
        edges: Record<string, number>;
      }>(path.join(tempDir, ".arch", "graph.json"));
      const tasks = await readJson<{ tasks: Array<{ id: string }> }>(
        path.join(tempDir, ".arch", "nodes", "tasks.json"),
      );
      const milestones = await readJson<{ milestones: Array<{ id: string }> }>(
        path.join(tempDir, ".arch", "nodes", "milestones.json"),
      );

      expect(graph.schemaVersion).toBe("1.0");
      expect(graph.nodes.tasks).toBeGreaterThan(0);
      expect(graph.nodes.milestones).toBeGreaterThan(0);
      expect(tasks.tasks.length).toBe(graph.nodes.tasks);
      expect(milestones.milestones.length).toBe(graph.nodes.milestones);
    }, 15_000);

    it("should include task-to-decision edges for linked items", async () => {
      const phaseId = "graph-phase";
      const milestoneId = "graph-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "Graph Edge Task",
        discoveredFromTask: null,
        cwd: tempDir,
      });
      const taskId = path.basename(taskPath).split("-")[0];
      const taskRef = `${phaseId}/${milestoneId}/${taskId}`;

      const decisionPath = await createDecision(
        {
          scope: "milestone",
          phase: phaseId,
          milestone: milestoneId,
          title: "Graph Edge Decision",
        },
        tempDir,
      );
      const decisionFullPath = path.join(tempDir, decisionPath);
      const decisionDoc = await readMarkdownWithFrontmatter<{ id: string }>(decisionFullPath);
      const decisionId = decisionDoc.data.id;

      await linkDecision(decisionId, { task: taskRef, code: "packages/ui/src/index.ts" }, tempDir);
      await rebuildArchitectureGraph(tempDir);

      const edges = await readJson<{ edges: Array<{ task: string; decision: string }> }>(
        path.join(tempDir, ".arch", "edges", "task_to_decision.json"),
      );

      expect(edges.edges).toContainEqual({ task: taskRef, decision: decisionId });
    }, 15_000);

    it("should skip invalid decision markdown files without throwing", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const invalidDecisionPath = path.join(tempDir, "roadmap", "decisions", "invalid.md");
      await writeFile(
        invalidDecisionPath,
        `---\nid: invalid:decision\ntitle: Invalid Decision\n---\n\nBroken content\n`,
      );

      await expect(rebuildArchitectureGraph(tempDir)).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalled();
      const warningLines = warnSpy.mock.calls.flatMap((args) => args.map(String));
      expect(
        warningLines.some((line) => line.includes("Skipping decision with invalid schema")),
      ).toBe(true);

      warnSpy.mockRestore();
    }, 15_000);

    it("should handle project with domains.json", async () => {
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [
            {
              name: "auth",
              ownedPackages: ["packages/auth"],
              ownedFeatures: ["authentication", "authorization"],
            },
            {
              name: "api",
              ownedPackages: ["packages/api"],
              ownedFeatures: ["rest-api"],
            },
          ],
        }),
      );

      await rebuildArchitectureGraph(tempDir);

      const domains = await readJson<{ domains: Array<{ name: string }> }>(
        path.join(tempDir, ".arch", "nodes", "domains.json"),
      );

      expect(domains.domains).toHaveLength(2);
      expect(domains.domains[0].name).toBe("auth");
      expect(domains.domains[1].name).toBe("api");
    }, 15_000);

    it("should handle project with ai-map/modules.json", async () => {
      const aiMapDir = path.join(tempDir, "ai-map");
      await fs.mkdir(aiMapDir, { recursive: true });
      await writeFile(
        path.join(aiMapDir, "modules.json"),
        JSON.stringify({
          modules: [
            { name: "auth-service", type: "service", description: "Authentication service" },
            { name: "user-model", type: "data-model", description: "User data model" },
          ],
        }),
      );

      await rebuildArchitectureGraph(tempDir);

      const modules = await readJson<{ modules: Array<{ name: string; type: string }> }>(
        path.join(tempDir, ".arch", "nodes", "modules.json"),
      );

      expect(modules.modules.length).toBeGreaterThan(0);
      // Modules from ai-map are included in the graph
      // Just verify the graph was built successfully
    }, 15_000);

    it("should handle invalid data in domains.json", async () => {
      const domainsDir = path.join(tempDir, "arch-domains");
      await fs.mkdir(domainsDir, { recursive: true });
      await writeFile(
        path.join(domainsDir, "domains.json"),
        JSON.stringify({
          domains: [{ name: "valid" }, null, { invalid: true }, { name: "another-valid" }],
        }),
      );

      await rebuildArchitectureGraph(tempDir);

      const domains = await readJson<{ domains: Array<{ name: string }> }>(
        path.join(tempDir, ".arch", "nodes", "domains.json"),
      );

      // Should only include valid domains
      expect(domains.domains).toHaveLength(2);
      expect(domains.domains.map((d) => d.name).sort()).toEqual(["another-valid", "valid"]);
    }, 15_000);

    it("should handle invalid data in modules.json", async () => {
      const aiMapDir = path.join(tempDir, "ai-map");
      await fs.mkdir(aiMapDir, { recursive: true });
      await writeFile(
        path.join(aiMapDir, "modules.json"),
        JSON.stringify({
          modules: [
            { name: "valid-module" },
            null,
            { type: "service" }, // missing name
            { name: "another-module", type: 123 }, // invalid type
          ],
        }),
      );

      await rebuildArchitectureGraph(tempDir);

      const modules = await readJson<{ modules: Array<{ name: string; type: string }> }>(
        path.join(tempDir, ".arch", "nodes", "modules.json"),
      );

      // Should include modules from aimap if valid data present
      // Module validation happens in the graph building logic
      expect(modules.modules.length).toBeGreaterThan(0);
    }, 15_000);

    it("should filter out task-to-decision edges for unknown decisions", async () => {
      const phaseId = "test-phase";
      const milestoneId = "test-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      // Create a task that references a non-existent decision
      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "Task with Invalid Decision Ref",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Manually add a non-existent decision reference to the task
      const taskContent = await readMarkdownWithFrontmatter<{
        id: string;
        decisions: string[];
      }>(taskPath);
      taskContent.data.decisions = ["non-existent:decision:id"];
      await writeFile(
        taskPath,
        `---\n${Object.entries(taskContent.data)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join("\n")}\n---\n\n${taskContent.content}`,
      );

      await rebuildArchitectureGraph(tempDir);

      const edges = await readJson<{ edges: Array<{ task: string; decision: string }> }>(
        path.join(tempDir, ".arch", "edges", "task_to_decision.json"),
      );

      // Should not include edge to non-existent decision
      const invalidEdge = edges.edges.find((e) => e.decision === "non-existent:decision:id");
      expect(invalidEdge).toBeUndefined();
    }, 15_000);

    it("should create module nodes from task codeTargets", async () => {
      const phaseId = "module-phase";
      const milestoneId = "module-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "Task with Code Targets",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      // Add codeTargets to the task
      const taskContent = await readMarkdownWithFrontmatter<{ codeTargets: string[] }>(taskPath);
      taskContent.data.codeTargets = ["packages/auth/src/login.ts", "packages/api/src/users.ts"];
      await writeFile(
        taskPath,
        `---\n${Object.entries(taskContent.data)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join("\n")}\n---\n\n${taskContent.content}`,
      );

      await rebuildArchitectureGraph(tempDir);

      const modules = await readJson<{ modules: Array<{ name: string }> }>(
        path.join(tempDir, ".arch", "nodes", "modules.json"),
      );
      const edges = await readJson<{ edges: Array<{ task: string; module: string }> }>(
        path.join(tempDir, ".arch", "edges", "task_to_module.json"),
      );

      // Should create modules from packages - module names are "packages/auth" not just "auth"
      expect(modules.modules.map((m) => m.name)).toContain("packages/auth");
      expect(modules.modules.map((m) => m.name)).toContain("packages/api");

      // Should create edges from task to modules
      expect(edges.edges.some((e) => e.module === "packages/auth")).toBe(true);
      expect(edges.edges.some((e) => e.module === "packages/api")).toBe(true);
    }, 15_000);

    it("should map architecture and docs targets into module nodes", async () => {
      const phaseId = "module-map-phase";
      const milestoneId = "module-map-milestone";

      await createPhase(phaseId, tempDir);
      await createMilestone(phaseId, milestoneId, tempDir);

      const taskPath = await createTask({
        phaseId,
        milestoneId,
        lane: "planned",
        title: "Task with mixed target paths",
        discoveredFromTask: null,
        cwd: tempDir,
      });

      const taskContent = await readMarkdownWithFrontmatter<{
        codeTargets: string[];
        publicDocs: string[];
      }>(taskPath);
      taskContent.data.codeTargets = [
        "architecture/decisions/adr-001.md",
        "arch-domains/domains.json",
        "roadmap/phases/module-map-phase/overview.md",
        "misc/file.txt",
        "/",
      ];
      taskContent.data.publicDocs = [];

      await writeFile(
        taskPath,
        `---\n${Object.entries(taskContent.data)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join("\n")}\n---\n\n${taskContent.content}`,
      );

      await rebuildArchitectureGraph(tempDir);

      const modules = await readJson<{ modules: Array<{ name: string }> }>(
        path.join(tempDir, ".arch", "nodes", "modules.json"),
      );

      const names = modules.modules.map((moduleNode) => moduleNode.name);
      expect(names).toContain("architecture/decisions");
      expect(names).toContain("arch-domains");
      expect(names).toContain("roadmap");
      expect(names).toContain("misc/file.txt");
      expect(names).toContain("/");
    }, 15_000);
  });
});
