import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureDir, writeFile } from "fs-extra";
import { learnPath } from "./learn";
import {
  createTestProject,
  createTempDir,
  resultAssertions,
  type TestProjectContext,
} from "../test/helpers";

describe.sequential("sdk/learn", () => {
  let context: TestProjectContext;

  beforeEach(async () => {
    context = await createTestProject(process.cwd());
  }, 120_000);

  afterEach(async () => {
    await context.cleanup();
  });

  it("returns a successful learn result with report and text output", async () => {
    const result = await learnPath({ paths: ["apps/web"] });

    resultAssertions.assertSuccess(result);
    expect(result.data.report.schemaVersion).toBe("2.0");
    expect(result.data.report.analyzedPaths).toEqual(["apps/web"]);
    expect(result.data.text).toContain("Scope");
  }, 120_000);

  it("returns an error result when no paths are provided", async () => {
    const result = await learnPath({ paths: [] });
    resultAssertions.assertErrorContains(result, "learn requires at least one --path value");
  });

  it("respects cwd when analyzing the provided repository root", async () => {
    const temp = await createTempDir();
    try {
      await ensureDir(`${temp.tempDir}/apps/web`);
      await writeFile(
        `${temp.tempDir}/apps/web/page.tsx`,
        "export default function Page() {}\n",
        "utf8",
      );

      const result = await learnPath({ paths: ["apps/web"], cwd: temp.tempDir });
      resultAssertions.assertSuccess(result);
      expect(result.data.report.analyzedPaths).toEqual(["apps/web"]);
    } finally {
      await temp.cleanup();
    }
  });
});
