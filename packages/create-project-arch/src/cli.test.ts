import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const currentDir = __dirname;
const archUiEslintConfigPath = path.resolve(currentDir, "../templates/arch-ui/eslint.config.js");
const foundationTemplateDir = path.resolve(currentDir, "../templates/foundation");
const domainTemplateDir = path.resolve(currentDir, "../templates/domains");
const architectureSpecTemplateDir = path.resolve(currentDir, "../templates/architecture-specs");
const conceptMapTemplatePath = path.resolve(
  currentDir,
  "../templates/concept-map/concept-map.json",
);
const decisionTemplateDir = path.resolve(currentDir, "../templates/decisions");
const gapClosureTemplateDir = path.resolve(currentDir, "../templates/gap-closure");
const validationHookTemplateDir = path.resolve(currentDir, "../templates/validation-hooks");

const foundationTemplateExpectations: Array<{ fileName: string; sectionHeader: string }> = [
  { fileName: "prompt.md", sectionHeader: "## Source Prompt" },
  { fileName: "project-overview.md", sectionHeader: "## Problem Statement" },
  { fileName: "goals.md", sectionHeader: "## Primary Goals" },
  { fileName: "user-journey.md", sectionHeader: "## Journey Steps" },
  { fileName: "scope.md", sectionHeader: "## In Scope" },
];

const domainTemplateExpectations: Array<{ fileName: string; sectionHeader: string }> = [
  { fileName: "core.md", sectionHeader: "## Responsibilities" },
  { fileName: "ui.md", sectionHeader: "## Responsibilities" },
  { fileName: "api.md", sectionHeader: "## Responsibilities" },
];

const architectureSpecTemplateSections = [
  "## Purpose",
  "## Scope",
  "## Key Definitions",
  "## Design",
  "## Data Model",
  "## Owning Domain",
  "## MVP Constraints",
];

const decisionTemplateSections = [
  "## Context",
  "## Decision",
  "## Rationale",
  "## Alternatives Considered",
  "## Affected Artifacts",
  "## Implementation Status Checklist",
];

const gapClosureTemplateSections = [
  "## Executive Summary",
  "## Gap Categories And Resolutions",
  "## Layer Synchronization Check",
  "## Coverage Audit",
  "## Remaining Gaps And Follow-On Items",
  "## Template Improvement Feedback",
];

function getImportedNextJsSymbol(source: string): string | null {
  const match = source.match(
    /import\s+\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}\s+from\s+["']@repo\/eslint-config\/next-js["']/,
  );
  return match?.[1] ?? null;
}

function getDefaultExportedSymbol(source: string): string | null {
  const match = source.match(/export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;?/);
  return match?.[1] ?? null;
}

describe("create-project-arch CLI", () => {
  it("runs test suite successfully", () => {
    expect(true).toBe(true);
  });

  it("keeps arch-ui eslint template wired to @repo/eslint-config/next-js export", () => {
    const archUiConfigSource = fs.readFileSync(archUiEslintConfigPath, "utf8");
    const importedSymbol = getImportedNextJsSymbol(archUiConfigSource);
    const defaultExportedSymbol = getDefaultExportedSymbol(archUiConfigSource);

    expect(importedSymbol).toBeTruthy();
    expect(defaultExportedSymbol).toBeTruthy();
    expect(defaultExportedSymbol).toBe(importedSymbol);
    expect(importedSymbol).toBe("nextJsConfig");
  });

  it("includes all foundation document templates with structured guidance", () => {
    for (const expectation of foundationTemplateExpectations) {
      const templatePath = path.join(foundationTemplateDir, expectation.fileName);
      expect(fs.existsSync(templatePath)).toBe(true);

      const templateSource = fs.readFileSync(templatePath, "utf8");
      expect(templateSource).toContain(expectation.sectionHeader);
      expect(templateSource).toContain("<!-- Guidance:");
    }
  });

  it("includes domain spec templates with ownership and milestone mapping guidance", () => {
    const domainsJsonPath = path.join(domainTemplateDir, "domains.json");
    const domainTemplatePath = path.join(domainTemplateDir, "DOMAIN_TEMPLATE.md");
    const domainReadmePath = path.join(domainTemplateDir, "README.md");

    expect(fs.existsSync(domainReadmePath)).toBe(true);
    expect(fs.readFileSync(domainReadmePath, "utf8")).toContain("domain boundaries");

    expect(fs.existsSync(domainsJsonPath)).toBe(true);
    const domainsJson = JSON.parse(fs.readFileSync(domainsJsonPath, "utf8")) as {
      domains?: Array<{ name?: string }>;
    };
    expect(Array.isArray(domainsJson.domains)).toBe(true);
    expect(domainsJson.domains?.map((domain) => domain.name)).toEqual(["core", "ui", "api"]);

    expect(fs.existsSync(domainTemplatePath)).toBe(true);
    const domainTemplateSource = fs.readFileSync(domainTemplatePath, "utf8");
    expect(domainTemplateSource).toContain("## Responsibilities");
    expect(domainTemplateSource).toContain("## Primary Data Ownership");
    expect(domainTemplateSource).toContain("## Interface Contracts");
    expect(domainTemplateSource).toContain("## Non-Goals");
    expect(domainTemplateSource).toContain("## Milestone Mapping");

    for (const expectation of domainTemplateExpectations) {
      const templatePath = path.join(domainTemplateDir, expectation.fileName);
      expect(fs.existsSync(templatePath)).toBe(true);

      const templateSource = fs.readFileSync(templatePath, "utf8");
      expect(templateSource).toContain(expectation.sectionHeader);
      expect(templateSource).toContain("## Milestone Mapping");
    }
  });

  it("includes reusable architecture spec template and example", () => {
    const specTemplatePath = path.join(architectureSpecTemplateDir, "SPEC_TEMPLATE.md");
    const exampleSpecPath = path.join(architectureSpecTemplateDir, "example-system.md");

    expect(fs.existsSync(specTemplatePath)).toBe(true);
    const specTemplateSource = fs.readFileSync(specTemplatePath, "utf8");

    for (const section of architectureSpecTemplateSections) {
      expect(specTemplateSource).toContain(section);
    }
    expect(specTemplateSource).toContain("<!-- Guidance:");

    expect(fs.existsSync(exampleSpecPath)).toBe(true);
    const exampleSpecSource = fs.readFileSync(exampleSpecPath, "utf8");
    expect(exampleSpecSource).toContain("# Example System Specification");
    expect(exampleSpecSource).toContain("## Purpose");
    expect(exampleSpecSource).toContain("## MVP Constraints");
  });

  it("includes concept-map template with traceability schema placeholders", () => {
    expect(fs.existsSync(conceptMapTemplatePath)).toBe(true);
    const conceptMap = JSON.parse(fs.readFileSync(conceptMapTemplatePath, "utf8")) as {
      schemaVersion?: string;
      concepts?: Array<Record<string, unknown>>;
      domainModuleMapping?: Array<Record<string, unknown>>;
      implementationChecklist?: Array<Record<string, unknown>>;
    };

    expect(conceptMap.schemaVersion).toBe("1.0");
    expect(Array.isArray(conceptMap.concepts)).toBe(true);
    expect((conceptMap.concepts ?? []).length).toBeGreaterThanOrEqual(2);

    const firstConcept = conceptMap.concepts?.[0] ?? {};
    expect(firstConcept).toHaveProperty("id");
    expect(firstConcept).toHaveProperty("name");
    expect(firstConcept).toHaveProperty("description");
    expect(firstConcept).toHaveProperty("owningDomain");
    expect(firstConcept).toHaveProperty("moduleResponsibilities");
    expect(firstConcept).toHaveProperty("implementationSurfaces");
    expect(firstConcept).toHaveProperty("dependencies");

    expect(Array.isArray(conceptMap.domainModuleMapping)).toBe(true);
    expect(Array.isArray(conceptMap.implementationChecklist)).toBe(true);
  });

  it("includes decision record template and example with structured frontmatter", () => {
    const decisionTemplatePath = path.join(decisionTemplateDir, "DECISION_TEMPLATE.md");
    const decisionExamplePath = path.join(decisionTemplateDir, "example-decision.md");
    const decisionReadmePath = path.join(decisionTemplateDir, "README.md");

    expect(fs.existsSync(decisionReadmePath)).toBe(true);
    expect(fs.readFileSync(decisionReadmePath, "utf8")).toContain("pa decision new");

    expect(fs.existsSync(decisionTemplatePath)).toBe(true);
    const decisionTemplateSource = fs.readFileSync(decisionTemplatePath, "utf8");
    expect(decisionTemplateSource).toContain("---");
    expect(decisionTemplateSource).toContain("id:");
    expect(decisionTemplateSource).toContain("title:");
    expect(decisionTemplateSource).toContain("slug:");
    expect(decisionTemplateSource).toContain("status:");
    expect(decisionTemplateSource).toContain("createdAt:");
    expect(decisionTemplateSource).toContain("updatedAt:");
    expect(decisionTemplateSource).toContain("relatedTasks:");
    expect(decisionTemplateSource).toContain("relatedDocs:");

    for (const section of decisionTemplateSections) {
      expect(decisionTemplateSource).toContain(section);
    }

    expect(fs.existsSync(decisionExamplePath)).toBe(true);
    const decisionExampleSource = fs.readFileSync(decisionExamplePath, "utf8");
    expect(decisionExampleSource).toContain('status: "accepted"');
    expect(decisionExampleSource).toContain("## Decision");
    expect(decisionExampleSource).toContain("## Alternatives Considered");
  });

  it("includes milestone gap-closure report template and example", () => {
    const gapClosureTemplatePath = path.join(gapClosureTemplateDir, "GAP_CLOSURE_TEMPLATE.md");
    const gapClosureExamplePath = path.join(gapClosureTemplateDir, "example-gap-closure.md");
    const gapClosureReadmePath = path.join(gapClosureTemplateDir, "README.md");

    expect(fs.existsSync(gapClosureReadmePath)).toBe(true);
    expect(fs.readFileSync(gapClosureReadmePath, "utf8")).toContain("pa check");

    expect(fs.existsSync(gapClosureTemplatePath)).toBe(true);
    const gapClosureTemplateSource = fs.readFileSync(gapClosureTemplatePath, "utf8");
    for (const section of gapClosureTemplateSections) {
      expect(gapClosureTemplateSource).toContain(section);
    }
    expect(gapClosureTemplateSource).toContain("- [ ]");

    expect(fs.existsSync(gapClosureExamplePath)).toBe(true);
    const gapClosureExampleSource = fs.readFileSync(gapClosureExamplePath, "utf8");
    expect(gapClosureExampleSource).toContain("# Milestone Gap-Closure Report - Example");
    expect(gapClosureExampleSource).toContain("## Layer Synchronization Check");
    expect(gapClosureExampleSource).toContain("- [x]");
  });

  it("includes local validation hook script and pre-commit example", () => {
    const validateScriptPath = path.join(validationHookTemplateDir, "scripts", "validate.sh");
    const preCommitPath = path.join(validationHookTemplateDir, ".githooks", "pre-commit");
    const readmePath = path.join(validationHookTemplateDir, "README.md");

    expect(fs.existsSync(validateScriptPath)).toBe(true);
    const validateScriptSource = fs.readFileSync(validateScriptPath, "utf8");
    expect(validateScriptSource).toContain("pnpm arch:check");
    expect(validateScriptSource).toContain("pnpm arch:report");

    expect(fs.existsSync(preCommitPath)).toBe(true);
    expect(fs.readFileSync(preCommitPath, "utf8")).toContain("sh scripts/validate.sh");

    expect(fs.existsSync(readmePath)).toBe(true);
    expect(fs.readFileSync(readmePath, "utf8")).toContain("Task Verification Guidance");
  });
});
