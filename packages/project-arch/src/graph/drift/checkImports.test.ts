import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { writeFile } from "../../fs";
import { checkImports } from "./checkImports";

describe("graph/drift/checkImports", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "drift-imports-test-"));
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("should report layer violations when package imports from apps", async () => {
    await writeFile(
      path.join(tempDir, "packages", "lib", "src", "index.ts"),
      "import { thing } from 'apps/web/lib/thing';\nexport { thing };\n",
    );

    const findings = await checkImports(tempDir);

    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("LAYER_VIOLATION");
    expect(findings[0].severity).toBe("error");
  });

  it("should report dynamic import layer violations", async () => {
    await writeFile(
      path.join(tempDir, "packages", "lib", "src", "dynamic.ts"),
      "export async function load(){ return import('apps/web/lib/thing'); }\n",
    );

    const findings = await checkImports(tempDir);

    expect(findings.some((f) => f.code === "LAYER_VIOLATION")).toBe(true);
  });

  it("should ignore imports in apps layer files", async () => {
    await writeFile(
      path.join(tempDir, "apps", "web", "src", "index.ts"),
      "import { x } from 'apps/web/lib/local';\nexport { x };\n",
    );

    const findings = await checkImports(tempDir);

    expect(findings).toEqual([]);
  });

  it("should pass for package imports that do not reference apps", async () => {
    await writeFile(
      path.join(tempDir, "packages", "lib", "src", "index.ts"),
      "import { util } from './util';\nexport { util };\n",
    );

    const findings = await checkImports(tempDir);

    expect(findings).toEqual([]);
  });
});
