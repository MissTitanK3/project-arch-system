import { describe, it, expect } from "vitest";
import { formatEnhancedHelp, formatCommandCatalog } from "./format";

describe("Help Format", () => {
  describe("formatEnhancedHelp", () => {
    it("should format basic help with usage and description", () => {
      const help = formatEnhancedHelp({
        usage: "pa test <arg>",
        description: "A test command",
      });

      expect(help).toContain("Usage: pa test <arg>");
      expect(help).toContain("A test command");
    });

    it("should include options section when provided", () => {
      const help = formatEnhancedHelp({
        usage: "pa test",
        description: "Test",
        options: [{ flag: "--opt <value>", description: "An option" }],
      });

      expect(help).toContain("Options:");
      expect(help).toContain("--opt <value>");
      expect(help).toContain("An option");
    });

    it("should include examples section when provided", () => {
      const help = formatEnhancedHelp({
        usage: "pa test",
        description: "Test",
        examples: [{ description: "Simple example", command: "pa test --flag" }],
      });

      expect(help).toContain("Examples:");
      expect(help).toContain("# Simple example");
      expect(help).toContain("pa test --flag");
    });

    it("should include agent metadata when provided", () => {
      const help = formatEnhancedHelp({
        usage: "pa test",
        description: "Test",
        agentMetadata: {
          inputValidation: { arg: "string matching /^\\d+$/" },
          outputFormat: "Success message",
          fileLocation: "path/to/file",
          schemaReference: "schemas/test.ts",
        },
      });

      expect(help).toContain("For AI Agents:");
      expect(help).toContain("Input validation:");
      expect(help).toContain("arg: string matching /^\\d+$/");
      expect(help).toContain("Output format:");
      expect(help).toContain("Success message");
      expect(help).toContain("File location:");
      expect(help).toContain("path/to/file");
      expect(help).toContain("Schema reference:");
      expect(help).toContain("schemas/test.ts");
    });

    it("should include common issues when provided", () => {
      const help = formatEnhancedHelp({
        usage: "pa test",
        description: "Test",
        commonIssues: [{ issue: "Error message", solution: "Do this" }],
      });

      expect(help).toContain("Common Issues:");
      expect(help).toContain('"Error message" → Do this');
    });

    it("should include related commands when provided", () => {
      const help = formatEnhancedHelp({
        usage: "pa test",
        description: "Test",
        relatedCommands: [{ command: "pa other --help", description: "Other command" }],
      });

      expect(help).toContain("See also:");
      expect(help).toContain("pa other --help");
      expect(help).toContain("Other command");
    });

    it("should include extra sections when provided", () => {
      const help = formatEnhancedHelp({
        usage: "pa test",
        description: "Test",
        extraSections: [{ title: "Additional Info", content: "Some extra content" }],
      });

      expect(help).toContain("Additional Info:");
      expect(help).toContain("Some extra content");
    });
  });

  describe("formatCommandCatalog", () => {
    it("should format command catalog with descriptions", () => {
      const catalog = formatCommandCatalog([
        {
          command: "pa test <arg>",
          description: "Test command",
        },
      ]);

      expect(catalog).toContain("pa test <arg>");
      expect(catalog).toContain("Test command");
    });

    it("should include options when provided", () => {
      const catalog = formatCommandCatalog([
        {
          command: "pa test",
          description: "Test",
          options: "--flag",
        },
      ]);

      expect(catalog).toContain("Options: --flag");
    });

    it("should include output when provided", () => {
      const catalog = formatCommandCatalog([
        {
          command: "pa test",
          description: "Test",
          output: "Success message",
        },
      ]);

      expect(catalog).toContain("Output: Success message");
    });
  });
});
