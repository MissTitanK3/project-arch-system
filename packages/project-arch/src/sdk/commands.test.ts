import { describe, it, expect } from "vitest";
import { commandMetadata } from "./commands";

describe("sdk/commands", () => {
  describe("commandMetadata", () => {
    it("should define metadata for tasks.create", () => {
      expect(commandMetadata["tasks.create"]).toBeDefined();
      expect(commandMetadata["tasks.create"].description).toBe("Create a planned task");
      expect(commandMetadata["tasks.create"].inputs).toEqual(["phase", "milestone", "title"]);
    });

    it("should define metadata for tasks.discover", () => {
      expect(commandMetadata["tasks.discover"]).toBeDefined();
      expect(commandMetadata["tasks.discover"].description).toBe("Create a discovered task");
      expect(commandMetadata["tasks.discover"].inputs).toEqual([
        "phase",
        "milestone",
        "from",
        "title",
      ]);
    });

    it("should define metadata for phases.create", () => {
      expect(commandMetadata["phases.create"]).toBeDefined();
      expect(commandMetadata["phases.create"].description).toBe("Create a phase");
      expect(commandMetadata["phases.create"].inputs).toEqual(["id"]);
    });

    it("should define metadata for milestones.create", () => {
      expect(commandMetadata["milestones.create"]).toBeDefined();
      expect(commandMetadata["milestones.create"].description).toBe("Create a milestone");
      expect(commandMetadata["milestones.create"].inputs).toEqual(["phase", "milestone"]);
    });

    it("should define metadata for decisions.create", () => {
      expect(commandMetadata["decisions.create"]).toBeDefined();
      expect(commandMetadata["decisions.create"].description).toBe("Create a decision");
      expect(commandMetadata["decisions.create"].inputs).toEqual([
        "scope",
        "phase",
        "milestone",
        "slug",
        "title",
      ]);
    });

    it("should define metadata for graph.traceTask", () => {
      expect(commandMetadata["graph.traceTask"]).toBeDefined();
      expect(commandMetadata["graph.traceTask"].description).toBe(
        "Trace a task in the architecture graph",
      );
      expect(commandMetadata["graph.traceTask"].inputs).toEqual(["task"]);
    });

    it("should define metadata for next.resolve", () => {
      expect(commandMetadata["next.resolve"]).toBeDefined();
      expect(commandMetadata["next.resolve"].description).toBe(
        "Resolve the deterministic next workflow action",
      );
      expect(commandMetadata["next.resolve"].inputs).toEqual([]);
    });

    it("should define metadata for policy.check", () => {
      expect(commandMetadata["policy.check"]).toBeDefined();
      expect(commandMetadata["policy.check"].description).toBe(
        "Detect policy conflicts between tasks and architecture",
      );
      expect(commandMetadata["policy.check"].inputs).toEqual([]);
    });

    it("should define metadata for policy.explain", () => {
      expect(commandMetadata["policy.explain"]).toBeDefined();
      expect(commandMetadata["policy.explain"].description).toBe(
        "Explain policy conflicts with remediation guidance",
      );
      expect(commandMetadata["policy.explain"].inputs).toEqual([]);
    });

    it("should define metadata for lint.frontmatter", () => {
      expect(commandMetadata["lint.frontmatter"]).toBeDefined();
      expect(commandMetadata["lint.frontmatter"].description).toBe(
        "Lint frontmatter for schema and YAML safety issues",
      );
      expect(commandMetadata["lint.frontmatter"].inputs).toEqual(["fix"]);
    });

    it("should define metadata for agents commands", () => {
      expect(commandMetadata["agents.list"]).toBeDefined();
      expect(commandMetadata["agents.list"].description).toBe("List resolved agent skills");
      expect(commandMetadata["agents.list"].inputs).toEqual([]);

      expect(commandMetadata["agents.show"]).toBeDefined();
      expect(commandMetadata["agents.show"].description).toBe("Show details for a skill by id");
      expect(commandMetadata["agents.show"].inputs).toEqual(["id"]);

      expect(commandMetadata["agents.new"]).toBeDefined();
      expect(commandMetadata["agents.new"].description).toBe("Scaffold a new user skill");
      expect(commandMetadata["agents.new"].inputs).toEqual([
        "id",
        "title",
        "summary",
        "overrides",
        "tags",
      ]);

      expect(commandMetadata["agents.sync"]).toBeDefined();
      expect(commandMetadata["agents.sync"].description).toBe("Sync derived skills registry");
      expect(commandMetadata["agents.sync"].inputs).toEqual(["check"]);

      expect(commandMetadata["agents.check"]).toBeDefined();
      expect(commandMetadata["agents.check"].description).toBe("Run focused skill validation");
      expect(commandMetadata["agents.check"].inputs).toEqual([]);
    });

    it("should have all commands use consistent structure", () => {
      const allCommands = Object.values(commandMetadata);

      for (const cmd of allCommands) {
        expect(cmd).toHaveProperty("description");
        expect(cmd).toHaveProperty("inputs");
        expect(typeof cmd.description).toBe("string");
        expect(Array.isArray(cmd.inputs)).toBe(true);
      }
    });
  });
});
