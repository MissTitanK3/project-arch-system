import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import {
  assertSupportedRuntimeCompatibility,
  detectRuntimeCompatibility,
} from "./compatibility";
import { createTestProject, type TestProjectContext } from "../../test/helpers";

describe("core/runtime/compatibility", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  }, 120_000);

  it("detects the default sandbox runtime as hybrid", async () => {
    const status = await detectRuntimeCompatibility(tempDir);

    expect(status.mode).toBe("hybrid");
    expect(status.supported).toBe(true);
    expect(status.canonicalRootExists).toBe(true);
    expect(status.legacyRootExists).toBe(true);
  });

  it("detects project-scoped-only runtimes when the legacy mirror is absent", async () => {
    await fs.remove(path.join(tempDir, "roadmap", "phases"));

    const status = await detectRuntimeCompatibility(tempDir);

    expect(status.mode).toBe("project-scoped-only");
    expect(status.supported).toBe(true);
    expect(status.canonicalRootExists).toBe(true);
    expect(status.legacyRootExists).toBe(false);
  });

  it("detects legacy-only runtimes when the project-scoped tree is absent", async () => {
    await fs.remove(path.join(tempDir, "roadmap", "projects"));

    const status = await detectRuntimeCompatibility(tempDir);

    expect(status.mode).toBe("legacy-only");
    expect(status.supported).toBe(false);
    expect(status.canonicalRootExists).toBe(false);
    expect(status.legacyRootExists).toBe(true);
  });

  it("rejects runtime operations for legacy-only repositories", async () => {
    await fs.remove(path.join(tempDir, "roadmap", "projects"));

    await expect(assertSupportedRuntimeCompatibility("Context resolution", tempDir)).rejects.toThrow(
      /legacy-only roadmap runtimes/i,
    );
  });
});
