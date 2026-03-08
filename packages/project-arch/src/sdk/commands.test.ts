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
