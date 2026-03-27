import { describe, expect, it } from "vitest";
import {
  generateArchitectureFamilyReadme,
  generateStandardsContent,
} from "./documentBuilders";

describe("core/init/documentBuilders", () => {
  it("renders standards content for markdown standards with linting guidance", () => {
    const rendered = generateStandardsContent(
      "markdown-standards.md",
      "Markdown Standards",
      "Formatting rules for markdown.",
    );

    expect(rendered).toContain("# Markdown Standards");
    expect(rendered).toContain("## Formatting Rules");
    expect(rendered).toContain("pnpm lint:md");
    expect(rendered).toContain("pa lint frontmatter --fix");
  });

  it("renders standards content for repo structure with placement rules", () => {
    const rendered = generateStandardsContent(
      "repo-structure.md",
      "Repository Structure",
      "Repository layout guidance.",
    );

    expect(rendered).toContain("## Directory Layout");
    expect(rendered).toContain("├── packages/");
    expect(rendered).toContain("- Execution tracking → `roadmap/`");
  });

  it("renders standards content for typescript and nextjs with template-specific guidance", () => {
    const typescript = generateStandardsContent(
      "typescript-standards.md",
      "TypeScript Standards",
      "TypeScript guidance.",
    );
    const nextjs = generateStandardsContent(
      "nextjs-standards.md",
      "Next.js Standards",
      "Next.js guidance.",
    );

    expect(typescript).toContain("## Type Safety");
    expect(typescript).toContain("- Use strict TypeScript configuration (`strict: true`)");
    expect(nextjs).toContain("## App Router");
    expect(nextjs).toContain("- Server Components by default, Client Components only when needed");
  });

  it("renders architecture family readme guidance for governance", () => {
    const rendered = generateArchitectureFamilyReadme(
      "governance",
      "Governance",
      "Governance surface guidance.",
    );

    expect(rendered).toContain("# Governance");
    expect(rendered).toContain("- repository model and authority rules");
    expect(rendered).toContain("- Use `governance/` for who owns decisions");
    expect(rendered).toContain("- Use `standards/` for rules contributors must follow while implementing.");
  });

  it("renders default architecture family guidance for unknown areas", () => {
    const rendered = generateArchitectureFamilyReadme(
      "custom-surface",
      "Custom Surface",
      "Custom surface guidance.",
    );

    expect(rendered).toContain("# Custom Surface");
    expect(rendered).toContain("## Belongs Here");
    expect(rendered).toContain("- documents that match this family's stated role");
  });

  it("renders legacy transition guidance for foundation and legacy architecture families", () => {
    const foundation = generateArchitectureFamilyReadme(
      "foundation",
      "Legacy Foundation",
      "Legacy framing guidance.",
    );
    const legacyArchitecture = generateArchitectureFamilyReadme(
      "legacy-architecture",
      "Legacy Architecture",
      "Legacy architecture guidance.",
    );

    expect(foundation).toContain("- Treat `foundation/` as transitional support only.");
    expect(foundation).toContain("Move active goals, scope, risk, and concept documents");
    expect(legacyArchitecture).toContain("- Treat `legacy-architecture/` as transitional support only.");
    expect(legacyArchitecture).toContain("Move active authoritative documents into `systems/`");
  });
});
