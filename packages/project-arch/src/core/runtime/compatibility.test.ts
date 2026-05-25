import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import {
  assertSupportedRuntimeCompatibility,
  detectRuntimeCompatibility,
  resolveRuntimeCompatibilityContract,
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

  it("detects the default sandbox runtime as project-scoped-only", async () => {
    const status = await detectRuntimeCompatibility(tempDir);

    expect(status.mode).toBe("project-scoped-only");
    expect(status.supported).toBe(true);
    expect(status.canonicalRootExists).toBe(true);
    expect(status.legacyRootExists).toBe(false);
  });

  it("detects hybrid runtimes when the legacy mirror is present", async () => {
    await fs.ensureDir(path.join(tempDir, "roadmap", "phases"));

    const status = await detectRuntimeCompatibility(tempDir);

    expect(status.mode).toBe("hybrid");
    expect(status.supported).toBe(true);
    expect(status.canonicalRootExists).toBe(true);
    expect(status.legacyRootExists).toBe(true);
  });

  it("detects legacy-only runtimes when the project-scoped tree is absent", async () => {
    await fs.ensureDir(path.join(tempDir, "roadmap", "phases"));
    await fs.remove(path.join(tempDir, "roadmap", "projects"));

    const status = await detectRuntimeCompatibility(tempDir);

    expect(status.mode).toBe("legacy-only");
    expect(status.supported).toBe(false);
    expect(status.canonicalRootExists).toBe(false);
    expect(status.legacyRootExists).toBe(true);
  });

  it("rejects runtime operations for legacy-only repositories", async () => {
    await fs.remove(path.join(tempDir, "roadmap", "projects"));

    await expect(
      assertSupportedRuntimeCompatibility("Context resolution", tempDir),
    ).rejects.toThrow(/legacy-only roadmap runtimes/i);
  });

  it("surfaces project-scoped-only validation contract as supported with canonical guidance", async () => {
    const contract = await resolveRuntimeCompatibilityContract("validation", tempDir);

    expect(contract.mode).toBe("project-scoped-only");
    expect(contract.supported).toBe(true);
    expect(contract.reason).toContain("canonical project-scoped roadmap");
  });

  it("surfaces hybrid validation contract explicitly when the legacy mirror is present", async () => {
    await fs.ensureDir(path.join(tempDir, "roadmap", "phases"));

    const contract = await resolveRuntimeCompatibilityContract("validation", tempDir);

    expect(contract.mode).toBe("hybrid");
    expect(contract.supported).toBe(true);
    expect(contract.reason).toContain("prefers canonical project-scoped roadmap paths");
  });

  it("keeps legacy-only reporting readable while preserving migration guidance", async () => {
    await fs.remove(path.join(tempDir, "roadmap", "projects"));

    const contract = await resolveRuntimeCompatibilityContract("reporting", tempDir);

    expect(contract.mode).toBe("legacy-only");
    expect(contract.supported).toBe(true);
    expect(contract.reason).toContain("project-scoped inventory and provenance are unavailable");
  });
});
