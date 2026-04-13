import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildArtifactBrowserModel,
  PROJECT_ARCH_ROOT_CANDIDATES,
  rootCandidateLabel,
} from "./artifactBrowserModelLoader";

const tempRoots: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-arch-browser-loader-"));
  tempRoots.push(root);
  return root;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const target = tempRoots.pop();
    if (!target) {
      continue;
    }

    await fs.rm(target, { recursive: true, force: true });
  }
});

describe("PROJECT_ARCH_ROOT_CANDIDATES", () => {
  it("includes canonical root candidates", () => {
    expect(PROJECT_ARCH_ROOT_CANDIDATES).toContain("feedback");
    expect(PROJECT_ARCH_ROOT_CANDIDATES).toContain("roadmap");
    expect(PROJECT_ARCH_ROOT_CANDIDATES).toContain(".project-arch");
    expect(PROJECT_ARCH_ROOT_CANDIDATES).toContain(".project-arch/workflows");
    expect(PROJECT_ARCH_ROOT_CANDIDATES).toContain(".github/workflows");
  });
});

describe("rootCandidateLabel", () => {
  it("returns a descriptive label for .project-arch/workflows", () => {
    expect(rootCandidateLabel(".project-arch/workflows")).toContain("canonical workflow documents");
  });

  it("returns a descriptive label for .github/workflows", () => {
    expect(rootCandidateLabel(".github/workflows")).toContain("legacy compatibility");
  });

  it("returns the basename for other paths", () => {
    expect(rootCandidateLabel("feedback")).toBe("feedback");
    expect(rootCandidateLabel("roadmap")).toBe("roadmap");
    expect(rootCandidateLabel(".project-arch")).toBe(".project-arch");
  });
});

describe("buildArtifactBrowserModel", () => {
  it("returns a model with a root node even when no root candidates exist", async () => {
    const root = await createTempWorkspace();
    const model = await buildArtifactBrowserModel(root);

    expect(model.generatedAt).toBeTruthy();
    expect(model.nodes[""]).toEqual(
      expect.objectContaining({
        relativePath: "",
        label: "Repository",
        directories: [],
        files: [],
      }),
    );
  });

  it("includes an existing root candidate directory in root node directories", async () => {
    const root = await createTempWorkspace();
    await fs.mkdir(path.join(root, "feedback"), { recursive: true });

    const model = await buildArtifactBrowserModel(root);
    const rootNode = model.nodes[""];

    expect(rootNode?.directories.some((dir) => dir.relativePath === "feedback")).toBe(true);
  });

  it("does not include missing root candidate directories", async () => {
    const root = await createTempWorkspace();
    // only create "feedback", not "roadmap"
    await fs.mkdir(path.join(root, "feedback"), { recursive: true });

    const model = await buildArtifactBrowserModel(root);
    const rootNode = model.nodes[""];

    expect(rootNode?.directories.some((dir) => dir.relativePath === "roadmap")).toBe(false);
  });

  it("traverses subdirectories and builds child nodes", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/overview.md", "# Overview");

    const model = await buildArtifactBrowserModel(root);

    expect(model.nodes["feedback"]).toBeDefined();
    expect(model.nodes["feedback/phases"]).toBeDefined();
    expect(model.nodes["feedback/phases"]?.files.some((f) => f.label === "overview.md")).toBe(true);
  });

  it("marks markdown files correctly", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/doc.md", "# Doc");
    await writeFile(root, "feedback/data.json", "{}");

    const model = await buildArtifactBrowserModel(root);
    const feedbackNode = model.nodes["feedback"];

    const mdFile = feedbackNode?.files.find((f) => f.label === "doc.md");
    const jsonFile = feedbackNode?.files.find((f) => f.label === "data.json");

    expect(mdFile?.isMarkdown).toBe(true);
    expect(jsonFile?.isMarkdown).toBe(false);
  });

  it("extracts task metadata for markdown files with frontmatter", async () => {
    const root = await createTempWorkspace();
    const taskContent = [
      "---",
      'id: "001"',
      'title: "First task"',
      'status: "planned"',
      "lane: planned",
      "tags:",
      "  - extension",
      "traceLinks:",
      "  - roadmap/projects/shared/phases/phase-1/overview.md",
      "  - >- # folded",
      "    roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "  - >- # folded",
      "    roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
      "---",
      "",
      "## Body",
    ].join("\n");

    await writeFile(
      root,
      "feedback/phases/p-1/milestones/m-1/tasks/planned/001-first-task.md",
      taskContent,
    );

    const model = await buildArtifactBrowserModel(root);

    const feedbackNode = model.nodes["feedback"];
    expect(feedbackNode).toBeDefined();

    // Traverse deep to find the file
    const deepKey = "feedback/phases/p-1/milestones/m-1/tasks/planned";
    const deepNode = model.nodes[deepKey];
    expect(deepNode).toBeDefined();

    const taskFile = deepNode?.files[0];
    expect(taskFile?.label).toBe("001-first-task.md");
    expect(taskFile?.taskMetadata?.status).toBe("planned");
    expect(taskFile?.taskMetadata?.tags).toContain("extension");
    expect(taskFile?.taskMetadata?.traceLinks).toEqual([
      "roadmap/projects/shared/phases/phase-1/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/overview.md",
      "roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/targets.md",
    ]);
  });

  it("does not set isMarkdown or taskMetadata for non-markdown files", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/data.json", '{"key": "value"}');

    const model = await buildArtifactBrowserModel(root);
    const feedbackNode = model.nodes["feedback"];

    const jsonFile = feedbackNode?.files.find((f) => f.label === "data.json");
    expect(jsonFile).toBeDefined();
    expect(jsonFile?.isMarkdown).toBe(false);
    // Non-markdown files are never parsed for task metadata
    expect(jsonFile?.taskMetadata).toBeUndefined();
  });

  it("sets parentRelativePath on child nodes", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/phases/file.md", "# x");

    const model = await buildArtifactBrowserModel(root);

    expect(model.nodes["feedback/phases"]?.parentRelativePath).toBe("feedback");
    expect(model.nodes["feedback"]?.parentRelativePath).toBe("");
  });

  it("sorts files alphabetically within each node", async () => {
    const root = await createTempWorkspace();
    await writeFile(root, "feedback/z-last.md", "# Z");
    await writeFile(root, "feedback/a-first.md", "# A");
    await writeFile(root, "feedback/m-middle.md", "# M");

    const model = await buildArtifactBrowserModel(root);
    const files = model.nodes["feedback"]?.files.map((f) => f.label) ?? [];

    expect(files).toEqual(["a-first.md", "m-middle.md", "z-last.md"]);
  });

  it("sorts root directories alphabetically", async () => {
    const root = await createTempWorkspace();
    await fs.mkdir(path.join(root, "roadmap"), { recursive: true });
    await fs.mkdir(path.join(root, "feedback"), { recursive: true });

    const model = await buildArtifactBrowserModel(root);
    const dirLabels = model.nodes[""]?.directories.map((d) => d.relativePath) ?? [];

    const feedbackIdx = dirLabels.indexOf("feedback");
    const roadmapIdx = dirLabels.indexOf("roadmap");
    expect(feedbackIdx).toBeGreaterThanOrEqual(0);
    expect(roadmapIdx).toBeGreaterThanOrEqual(0);
    expect(feedbackIdx).toBeLessThan(roadmapIdx);
  });
});
