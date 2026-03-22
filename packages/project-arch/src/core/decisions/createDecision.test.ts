import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import {
  createDecision,
  linkDecision,
  listDecisions,
  setDecisionStatus,
  supersedeDecision,
} from "./createDecision";
import { readMarkdownWithFrontmatter } from "../../fs";

function decisionIdFromPath(relativePath: string): string {
  const filename = path.basename(relativePath, ".md");
  return filename;
}

describe("createDecision", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
    await createPhase("phase-2", tempDir);
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  }, 120_000);

  it("creates project-scoped decision with slug-based id", async () => {
    const relPath = await createDecision(
      { scope: "project", slug: "tech-stack", title: "Tech Stack" },
      tempDir,
    );

    expect(relPath).toContain("roadmap/decisions/");
    expect(relPath).toContain("project:");
    expect(relPath).toContain(":tech-stack");

    const absPath = path.join(tempDir, relPath);
    expect(await fs.pathExists(absPath)).toBe(true);
  });

  it("creates phase and milestone scoped decisions", async () => {
    const phasePath = await createDecision(
      { scope: "phase", phase: "phase-2", slug: "phase-architecture" },
      tempDir,
    );
    const milestonePath = await createDecision(
      {
        scope: "milestone",
        phase: "phase-2",
        milestone: "milestone-1-foundation",
        slug: "api-design",
      },
      tempDir,
    );

    expect(phasePath).toContain("phase-2:");
    expect(milestonePath).toContain("phase-2/milestone-1-foundation:");
  });

  it("requires phase/milestone fields for scoped decisions", async () => {
    await expect(createDecision({ scope: "phase", slug: "x" }, tempDir)).rejects.toThrow("--phase");
    await expect(
      createDecision({ scope: "milestone", phase: "phase-2", slug: "x" }, tempDir),
    ).rejects.toThrow("--phase and --milestone");
  });

  it("adds suffix when same scoped slug already exists", async () => {
    const first = await createDecision({ scope: "project", slug: "dup" }, tempDir);
    const second = await createDecision({ scope: "project", slug: "dup" }, tempDir);

    expect(first).not.toBe(second);
    expect(second).toContain("dup-2");
  });

  it("links decision to task/code/doc and deduplicates", async () => {
    const relPath = await createDecision({ scope: "project", slug: "linking" }, tempDir);
    const id = decisionIdFromPath(relPath);

    await linkDecision(
      id,
      {
        task: "phase-2/milestone-1-foundation/001",
        code: "src/foo.ts",
        doc: "architecture/notes.md",
      },
      tempDir,
    );

    await linkDecision(
      id,
      {
        task: "phase-2/milestone-1-foundation/001",
        code: "src/foo.ts",
        doc: "architecture/notes.md",
      },
      tempDir,
    );

    const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(
      path.join(tempDir, relPath),
    );
    const links = data.links as {
      tasks: string[];
      codeTargets: string[];
      publicDocs: string[];
    };

    expect(links.tasks).toEqual(["phase-2/milestone-1-foundation/001"]);
    expect(links.codeTargets).toEqual(["src/foo.ts"]);
    expect(links.publicDocs).toEqual(["architecture/notes.md"]);
  }, 15000);

  it("updates status and supersedes older decision", async () => {
    const oldPath = await createDecision({ scope: "project", slug: "old" }, tempDir);
    const newPath = await createDecision({ scope: "project", slug: "new" }, tempDir);
    const oldId = decisionIdFromPath(oldPath);
    const newId = decisionIdFromPath(newPath);

    await setDecisionStatus(oldId, "accepted", tempDir);
    await supersedeDecision(newId, oldId, tempDir);

    const { data: oldData } = await readMarkdownWithFrontmatter<Record<string, unknown>>(
      path.join(tempDir, oldPath),
    );
    const { data: newData } = await readMarkdownWithFrontmatter<Record<string, unknown>>(
      path.join(tempDir, newPath),
    );

    expect(oldData.status).toBe("superseded");
    expect(newData.status).toBe("accepted");
    expect(newData.supersedes).toContain(oldId);
  });

  it("lists created decisions with statuses", async () => {
    const one = await createDecision({ scope: "project", slug: "one" }, tempDir);
    const two = await createDecision({ scope: "project", slug: "two" }, tempDir);

    await setDecisionStatus(decisionIdFromPath(one), "accepted", tempDir);

    const listed = await listDecisions(tempDir);
    const ids = listed.map((d) => d.id);

    expect(ids).toContain(decisionIdFromPath(one));
    expect(ids).toContain(decisionIdFromPath(two));
    expect(listed.some((d) => d.id === decisionIdFromPath(one) && d.status === "accepted")).toBe(
      true,
    );
  });
});
