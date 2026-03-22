import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestProject, createTempDir, type TestProjectContext } from "../../test/helpers";
import { runRepositoryChecks } from "../validation/check";
import { runCheck } from "./runCheck";

describe.sequential("core/checks/runCheck", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("should delegate to runRepositoryChecks", async () => {
    const direct = await runRepositoryChecks(tempDir);
    const viaWrapper = await runCheck(tempDir);

    expect(viaWrapper).toEqual(direct);
  }, 120_000);

  it("should return structured check result", async () => {
    const result = await runCheck(tempDir);

    expect(typeof result.ok).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  }, 120_000);

  it("should run against arbitrary cwd", async () => {
    const emptyContext = await createTempDir();

    try {
      const result = await runCheck(emptyContext.tempDir);
      expect(typeof result.ok).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    } finally {
      await emptyContext.cleanup();
    }
  });
});
