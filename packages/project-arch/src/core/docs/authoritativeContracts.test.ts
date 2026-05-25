import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AUTHORITATIVE_DOC_PATHS = [
  "README.md",
  "docs/check-json-diagnostics-schema.md",
  "docs/agents-skill-schema.md",
  "docs/reconciliation-report-schema.md",
  "docs/security-operations-model.md",
] as const;

function readAuthoritativeDoc(relativePath: (typeof AUTHORITATIVE_DOC_PATHS)[number]): string {
  return readFileSync(resolve(__dirname, "../../../", relativePath), "utf8");
}

describe("authoritative public-doc contracts", () => {
  it("keeps the protected authoritative surface explicit", () => {
    expect(AUTHORITATIVE_DOC_PATHS).toEqual([
      "README.md",
      "docs/check-json-diagnostics-schema.md",
      "docs/agents-skill-schema.md",
      "docs/reconciliation-report-schema.md",
      "docs/security-operations-model.md",
    ]);
  });

  it("keeps README check-json contract wording aligned to schemaVersion 2.0", () => {
    const readme = readAuthoritativeDoc("README.md");

    expect(readme).toContain("pa check --json");
    expect(readme).toContain('schemaVersion: "2.0"');
    expect(readme).not.toContain('schemaVersion: "1.0"');
  });

  it("keeps check-json diagnostics schema contract pinned to 2.0", () => {
    const diagnosticsSchema = readAuthoritativeDoc("docs/check-json-diagnostics-schema.md");

    expect(diagnosticsSchema).toContain("Current version: `2.0`");
    expect(diagnosticsSchema).toContain('"schemaVersion": "2.0"');
    expect(diagnosticsSchema).toContain('"status": "ok | invalid"');
    expect(diagnosticsSchema).not.toContain("Current version: `1.0`");
  });

  it("keeps agents skill schema contract pinned to 2.0", () => {
    const agentsSkillSchema = readAuthoritativeDoc("docs/agents-skill-schema.md");

    expect(agentsSkillSchema).toContain("Current contract version: `2.0`");
    expect(agentsSkillSchema).toContain('"schemaVersion": "2.0"');
    expect(agentsSkillSchema).toContain('"source": "builtin"');
    expect(agentsSkillSchema).not.toContain("Current contract version: `1.0`");
  });

  it("keeps reconciliation report schema pinned to 2.0 with optional runId", () => {
    const reconciliationSchema = readAuthoritativeDoc("docs/reconciliation-report-schema.md");

    expect(reconciliationSchema).toContain("Current version: `2.0`");
    expect(reconciliationSchema).toContain('schemaVersion: "2.0"');
    expect(reconciliationSchema).toContain("runId?: string");
    expect(reconciliationSchema).toContain(
      "| `runId`              | no       | `string`     | Optional execution run identifier associated with the reconciliation event.",
    );
    expect(reconciliationSchema).not.toContain("Current version: `1.0`");
  });

  it("keeps security operations command-truth wording stable", () => {
    const securityOperationsModel = readAuthoritativeDoc("docs/security-operations-model.md");

    expect(securityOperationsModel).toContain("pa check --changed");
    expect(securityOperationsModel).toContain("git status --porcelain");
    expect(securityOperationsModel).toContain("pa doctor");
    expect(securityOperationsModel).toContain("pnpm lint:md");
  });

  it("prevents unsupported task --project guidance from re-entering authoritative docs", () => {
    const authoritativeDocs = AUTHORITATIVE_DOC_PATHS.map((docPath) =>
      readAuthoritativeDoc(docPath),
    ).join("\n\n");

    expect(authoritativeDocs).not.toMatch(
      /pa task\s+(new|discover|idea|status|lanes)[^\n]*--project\s+<projectId>/,
    );
  });
});
