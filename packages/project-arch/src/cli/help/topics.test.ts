import { describe, it, expect } from "vitest";
import { getHelpTopic, listTopics, TOPIC_LIST } from "./topics";

describe("Help Topics", () => {
  describe("TOPIC_LIST", () => {
    it("should include all expected topics", () => {
      expect(TOPIC_LIST).toContain("commands");
      expect(TOPIC_LIST).toContain("workflows");
      expect(TOPIC_LIST).toContain("lanes");
      expect(TOPIC_LIST).toContain("decisions");
      expect(TOPIC_LIST).toContain("architecture");
      expect(TOPIC_LIST).toContain("standards");
    });
  });

  describe("getHelpTopic", () => {
    it("should return content for valid topic", () => {
      const content = getHelpTopic("commands");
      expect(content).toBeTruthy();
      expect(content).toContain("Available Commands");
    });

    it("should return content for workflows topic", () => {
      const content = getHelpTopic("workflows");
      expect(content).toBeTruthy();
      expect(content).toContain("Common Workflows");
      expect(content).toContain("pa task new");
    });

    it("should return content for lanes topic", () => {
      const content = getHelpTopic("lanes");
      expect(content).toBeTruthy();
      expect(content).toContain("Task Lanes");
      expect(content).toContain("Planned");
      expect(content).toContain("Discovered");
      expect(content).toContain("Backlog");
    });

    it("should return content for decisions topic", () => {
      const content = getHelpTopic("decisions");
      expect(content).toBeTruthy();
      expect(content).toContain("Architecture Decisions");
      expect(content).toContain("Decision Scopes");
    });

    it("should return content for architecture topic", () => {
      const content = getHelpTopic("architecture");
      expect(content).toBeTruthy();
      expect(content).toContain("Architecture Management");
      expect(content).toContain("roadmap/");
    });

    it("should return content for standards topic", () => {
      const content = getHelpTopic("standards");
      expect(content).toBeTruthy();
      expect(content).toContain("Project Architecture Standards");
      expect(content).toContain("File Naming");
    });

    it("should return null for invalid topic", () => {
      const content = getHelpTopic("invalid-topic");
      expect(content).toBeNull();
    });
  });

  describe("listTopics", () => {
    it("should return formatted topic list", () => {
      const list = listTopics();
      expect(list).toContain("Available help topics:");
      expect(list).toContain("commands");
      expect(list).toContain("workflows");
      expect(list).toContain("Usage: pa help <topic>");
    });

    it("should use empty description fallback for unknown topics", () => {
      TOPIC_LIST.push("unknown-topic" as keyof typeof import("./topics").HELP_TOPICS);
      try {
        const list = listTopics();
        expect(list).toContain("unknown-topic");
      } finally {
        TOPIC_LIST.pop();
      }
    });
  });
});
