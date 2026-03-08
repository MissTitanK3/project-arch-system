import { describe, it, expect } from "vitest";
import { registry } from "./registry";

describe("sdk/registry", () => {
  describe("registry exports", () => {
    it("should export init module", () => {
      expect(registry.init).toBeDefined();
      expect(registry.init.initRun).toBeDefined();
    });

    it("should export tasks module", () => {
      expect(registry.tasks).toBeDefined();
      expect(registry.tasks.taskCreate).toBeDefined();
      expect(registry.tasks.taskDiscover).toBeDefined();
      expect(registry.tasks.taskIdea).toBeDefined();
      expect(registry.tasks.taskStatus).toBeDefined();
    });

    it("should export phases module", () => {
      expect(registry.phases).toBeDefined();
      expect(registry.phases.phaseCreate).toBeDefined();
      expect(registry.phases.phaseList).toBeDefined();
    });

    it("should export milestones module", () => {
      expect(registry.milestones).toBeDefined();
      expect(registry.milestones.milestoneCreate).toBeDefined();
      expect(registry.milestones.milestoneList).toBeDefined();
    });

    it("should export decisions module", () => {
      expect(registry.decisions).toBeDefined();
      expect(registry.decisions.decisionCreate).toBeDefined();
      expect(registry.decisions.decisionLink).toBeDefined();
      expect(registry.decisions.decisionStatus).toBeDefined();
      expect(registry.decisions.decisionSupersede).toBeDefined();
      expect(registry.decisions.decisionList).toBeDefined();
    });

    it("should export graph module", () => {
      expect(registry.graph).toBeDefined();
      expect(registry.graph.graphBuild).toBeDefined();
      expect(registry.graph.graphTraceTask).toBeDefined();
      expect(registry.graph.graphRead).toBeDefined();
    });

    it("should export check module", () => {
      expect(registry.check).toBeDefined();
      expect(registry.check.checkRun).toBeDefined();
    });

    it("should export report module", () => {
      expect(registry.report).toBeDefined();
      expect(registry.report.reportGenerate).toBeDefined();
    });

    it("should export docs module", () => {
      expect(registry.docs).toBeDefined();
      expect(registry.docs.docsList).toBeDefined();
    });
  });
});
