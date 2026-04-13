import { describe, it, expect } from "vitest";
import { getHelpTopic, listTopics, TOPIC_LIST } from "./topics";

describe("Help Topics", () => {
  describe("TOPIC_LIST", () => {
    it("should include all expected topics", () => {
      expect(TOPIC_LIST).toContain("commands");
      expect(TOPIC_LIST).toContain("agents");
      expect(TOPIC_LIST).toContain("workflows");
      expect(TOPIC_LIST).toContain("lanes");
      expect(TOPIC_LIST).toContain("decisions");
      expect(TOPIC_LIST).toContain("architecture");
      expect(TOPIC_LIST).toContain("standards");
      expect(TOPIC_LIST).toContain("validation");
      expect(TOPIC_LIST).toContain("remediation");
      expect(TOPIC_LIST).toContain("operations");
    });
  });

  describe("getHelpTopic", () => {
    it("should return content for valid topic", () => {
      const content = getHelpTopic("commands");
      expect(content).toBeTruthy();
      expect(content).toContain("Available Commands");
    });

    it("should return content for agents topic", () => {
      const content = getHelpTopic("agents");
      expect(content).toBeTruthy();
      expect(content).toContain("Agent Skills");
      expect(content).toContain("pa agents new");
      expect(content).toContain("overrides=true");
      expect(content).toContain("pa agents sync --check");
      expect(content).toContain("No executable skill runtime");
    });

    it("should return content for workflows topic", () => {
      const content = getHelpTopic("workflows");
      expect(content).toBeTruthy();
      if (!content) {
        throw new Error("workflows help topic should be available");
      }
      expect(content).toContain("Common Workflows");
      expect(content).toContain(
        "Canonical fresh-output surface: .project-arch/workflows/*.workflow.md",
      );
      expect(content).toContain(".github/workflows/*.md");
      expect(content).toContain("non-canonical");
      expect(content).not.toContain("Canonical fresh-output surface: .github/workflows/*.md");
      expect(content).toContain("pa task new");
      expect(content).toContain("pa lint frontmatter --fix");
      expect(content).toContain("pnpm lint:md");
      expect(content).toContain("pa check");
      expect(content).toContain("pa doctor");

      const lintIdx = content.indexOf("pa lint frontmatter --fix");
      const mdLintIdx = content.indexOf("pnpm lint:md");
      const checkIdx = content.indexOf("pa check");
      expect(lintIdx).toBeGreaterThanOrEqual(0);
      expect(mdLintIdx).toBeGreaterThan(lintIdx);
      expect(checkIdx).toBeGreaterThan(mdLintIdx);
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

    it("should return content for validation topic", () => {
      const content = getHelpTopic("validation");
      expect(content).toBeTruthy();
      expect(content).toContain("Architecture Validation");
      expect(content).toContain("pa check");
      expect(content).toContain("pa lint frontmatter");
      expect(content).toContain("pa policy check");
    });

    it("should return content for remediation topic", () => {
      const content = getHelpTopic("remediation");
      expect(content).toBeTruthy();
      expect(content).toContain("Architecture Remediation");
      expect(content).toContain("Frontmatter YAML Issues");
      expect(content).toContain("Task Management Issues");
      expect(content).toContain('schemaVersion: "2.0"');
      expect(content).not.toContain(
        "Prepare and launch an authorized task through a runtime adapter",
      );
    });

    it("should return content for operations topic", () => {
      const content = getHelpTopic("operations");
      expect(content).toBeTruthy();
      expect(content).toContain("Security & Operations Model");
      expect(content).toContain("does not perform hidden HTTP(S) requests");
      expect(content).toContain("git status --porcelain");
      expect(content).toContain("pnpm lint:md");
      expect(content).toContain("roadmap/policy.json");
      expect(content).toContain(".project-arch/graph.config.json");
      expect(content).toContain(".project-arch/reconcile.config.json");
    });

    it("should return null for invalid topic", () => {
      const content = getHelpTopic("invalid-topic");
      expect(content).toBeNull();
    });
  });

  describe("Command Option Parity", () => {
    describe("commands topic documentation", () => {
      const commandsTopic = getHelpTopic("commands");

      it("should document pa check with --json option", () => {
        expect(commandsTopic).toContain("pa context [--json]");
        expect(commandsTopic).toContain("pa learn --path <path> [--json]");
        expect(commandsTopic).toContain("pa next [--json]");
        expect(commandsTopic).toContain("pa check");
        expect(commandsTopic).toContain("--json");
      });

      it("should document pa report with --verbose option", () => {
        expect(commandsTopic).toContain("pa report");
        expect(commandsTopic).toContain("--verbose");
      });

      it("should document pa lint frontmatter with --fix option", () => {
        expect(commandsTopic).toContain("pa lint frontmatter");
        expect(commandsTopic).toContain("--fix");
      });

      it("should document pa task lanes with --verbose option", () => {
        expect(commandsTopic).toContain("pa task lanes");
        expect(commandsTopic).toContain("--verbose");
      });

      it("should document pa milestone activate command", () => {
        expect(commandsTopic).toContain("pa milestone activate");
      });

      it("should document pa milestone complete command", () => {
        expect(commandsTopic).toContain("pa milestone complete");
      });

      it("should document pa policy check command", () => {
        expect(commandsTopic).toContain("pa policy check");
      });

      it("should document pa policy explain command", () => {
        expect(commandsTopic).toContain("pa policy explain");
      });

      it("should document pa agents sync check behavior", () => {
        expect(commandsTopic).toContain("pa agents sync [--check] [--json]");
        expect(commandsTopic).toContain("pa agents check [--json]");
      });

      it("should document pa doctor health command", () => {
        expect(commandsTopic).toContain("pa doctor health [--repair] [--json]");
      });

      it("should document canonical workflow guidance with explicit legacy boundary", () => {
        expect(commandsTopic).toContain("--with-workflows");
        expect(commandsTopic).toContain(".project-arch/workflows/*.workflow.md");
        expect(commandsTopic).toContain(".github/workflows/*.md");
        expect(commandsTopic).toContain("non-canonical");
        expect(commandsTopic).not.toContain(
          "materialize first-pass workflow files in .github/workflows",
        );
      });

      it("should include runtime command metadata registry derived from sdk metadata", () => {
        expect(commandsTopic).toContain("Runtime Command Metadata Registry:");
        expect(commandsTopic).toContain("tasks.create");
        expect(commandsTopic).toContain("Description: Create a planned task");
        expect(commandsTopic).toContain("agents.check");
      });

      it("should document shipped agent-runtime MVP commands", () => {
        expect(commandsTopic).toContain("Agent Runtime MVP (shipped):");
        expect(commandsTopic).toContain("pa agent prepare <taskRef>");
        expect(commandsTopic).toContain(
          "Outcomes: prepared (exit 0), approval-required boundary (exit 2), ineligible/error (exit 1)",
        );
        expect(commandsTopic).toContain(
          "--json: Emits SDK operation envelope with success/data or success/errors",
        );
        expect(commandsTopic).toContain("pa result import <path>");
        expect(commandsTopic).toContain("pa agent validate <runId>");
        expect(commandsTopic).toContain(
          "Outcomes: validation-failed (exit 1), validation-passed, escalation-ready (warning/default; failure with --strict)",
        );
        expect(commandsTopic).toContain(
          "--json: Emits SDK operation envelope with success/data or success/errors",
        );
        expect(commandsTopic).toContain("pa agent reconcile <runId>");
        expect(commandsTopic).toContain("pa agent audit [runId] [--json] [--limit <count>]");
        expect(commandsTopic).toContain("pa agent orchestrate <taskRef> --runtime <runtime>");
        expect(commandsTopic).toContain(
          "pa agent run <taskRef> --runtime <runtime> [--json] [--timeout-ms <ms>]",
        );
        expect(commandsTopic).toContain("pa agent status <runId> [--json]");
        expect(commandsTopic).toContain(
          "Outcomes: orchestration-in-progress, follow-up-review (waiting-for-result-import), role-failure, orchestration-completed",
        );
        expect(commandsTopic).toContain(
          "Follow-up/fallback: role failures and waiting-input states continue through result import -> validate -> reconcile",
        );
        expect(commandsTopic).toContain(
          "Escalation requests: Promoted to reviewable draft outputs under .project-arch/reconcile/escalations/",
        );
        expect(commandsTopic).toContain(
          "Inspect runtime-local audit history under .project-arch/agent-runtime/logs/",
        );
      });

      it("should mark deferred agent commands as future-only", () => {
        expect(commandsTopic).toContain("Deferred Agent Commands (future work):");
        expect(commandsTopic).toContain("pa agent escalate <runId>");
      });
    });
  });

  describe("listTopics", () => {
    it("should return formatted topic list", () => {
      const list = listTopics();
      expect(list).toContain("Available Commands");
      expect(list).toContain("Help Topics");
      expect(list).toContain("commands");
      expect(list).toContain("agents");
      expect(list).toContain("workflows");
      expect(list).toContain("pa help <topic>");
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
