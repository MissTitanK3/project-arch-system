import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { createProject } from "./createProject";
import { createTempDir, createTestProject, type TestProjectContext } from "../../test/helpers";

describe("createProject", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
    tempDir = context.tempDir;
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it("creates a new project scaffold with defaults", async () => {
    const manifest = await createProject({ id: "storefront" }, tempDir);

    expect(manifest.id).toBe("storefront");
    expect(manifest.title).toBe("Storefront");
    expect(manifest.type).toBe("application");
    expect(manifest.ownedPaths).toEqual(["apps/storefront"]);

    const projectRoot = path.join(tempDir, "roadmap", "projects", "storefront");
    expect(await fs.pathExists(path.join(projectRoot, "manifest.json"))).toBe(true);
    expect(await fs.pathExists(path.join(projectRoot, "overview.md"))).toBe(true);
    expect(await fs.pathExists(path.join(projectRoot, "phases"))).toBe(true);
  });

  it("accepts explicit metadata overrides", async () => {
    const manifest = await createProject(
      {
        id: "billing",
        title: "Billing Service",
        type: "service",
        summary: "Billing delivery surface.",
        ownedPaths: ["services/billing"],
        sharedDependencies: ["packages/config"],
        tags: ["payments", "critical"],
      },
      tempDir,
    );

    expect(manifest.title).toBe("Billing Service");
    expect(manifest.type).toBe("service");
    expect(manifest.summary).toBe("Billing delivery surface.");
    expect(manifest.ownedPaths).toEqual(["services/billing"]);
    expect(manifest.sharedDependencies).toEqual(["packages/config"]);
    expect(manifest.tags).toEqual(["payments", "critical"]);

    const overview = await fs.readFile(
      path.join(tempDir, "roadmap", "projects", "billing", "overview.md"),
      "utf8",
    );
    expect(overview).toContain("Billing Service");
    expect(overview).toContain("services/billing");
    expect(overview).toContain("packages/config");
    expect(overview).toContain("payments");
  });

  it("fails on duplicate project ids", async () => {
    await createProject({ id: "storefront" }, tempDir);
    await expect(createProject({ id: "storefront" }, tempDir)).rejects.toThrow("already exists");
  });

  it("fails when roadmap is not initialized", async () => {
    const uninit = await createTempDir();
    try {
      await expect(createProject({ id: "storefront" }, uninit.tempDir)).rejects.toThrow("pa init");
    } finally {
      await uninit.cleanup();
    }
  });
});
