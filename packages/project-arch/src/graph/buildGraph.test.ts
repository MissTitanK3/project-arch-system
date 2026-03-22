import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { initializeProject } from "../core/init/initializeProject";
import { buildGraph } from "./buildGraph";
import { pathExists, readJson } from "../fs";

describe.sequential("graph/buildGraph", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "build-graph-test-"));
    await initializeProject({ template: "nextjs-turbo", pm: "pnpm" }, tempDir);
  }, 120_000);

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should generate .arch/graph.json", async () => {
    await buildGraph(tempDir);

    const graphPath = path.join(tempDir, ".arch", "graph.json");
    expect(await pathExists(graphPath)).toBe(true);

    const graph = await readJson<{ schemaVersion: string }>(graphPath);
    expect(graph.schemaVersion).toBe("1.0");
  }, 120_000);

  it("should be idempotent across repeated calls", async () => {
    await buildGraph(tempDir);
    await buildGraph(tempDir);

    const graph = await readJson<{
      nodes: Record<string, number>;
      edges: Record<string, number>;
    }>(path.join(tempDir, ".arch", "graph.json"));

    expect(graph.nodes.tasks).toBeGreaterThan(0);
    expect(graph.nodes.milestones).toBeGreaterThan(0);
  }, 120_000);
});
