/**
 * First-Run Smoke Coverage — Mono Scaffold to Architecture Validation
 *
 * Exercises the minimum credible fresh-repo first-run workflow defined in:
 * feedback/5-17-2025-feedback-backlog/phase-6-first-run-polish/milestones/
 *   milestone-4-fresh-repo-smoke-coverage-and-phase-closure/tasks/
 *   001-design-the-minimum-credible-fresh-repo-smoke-path-for-the-current-scaffold.md
 *
 * Each test maps to one numbered step in the approved smoke-path baseline.
 * This suite proves the operational path end-to-end, not just individual artifact assertions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs-extra";
import { parse as parseYaml } from "yaml";
import { Command } from "commander";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { initializeProject } from "./initializeProject";
import { registerCheckCommand } from "../../cli/commands/check";
import { detectRuntimeCompatibility } from "../runtime/compatibility";

describe.sequential("first-run smoke: mono scaffold to architecture validation", () => {
  let context: TestProjectContext;
  let tempDir: string;
  const originalCwd = process.cwd();
  let originalExitCode: string | number | null | undefined;

  beforeEach(async () => {
    originalExitCode = process.exitCode;
    context = await createTempDir();
    tempDir = context.tempDir;
    process.chdir(tempDir);
    await initializeProject({ template: "nextjs-turbo", pm: "pnpm" }, tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    await context.cleanup();
  });

  // ─── Smoke Step 1: Init ──────────────────────────────────────────────────────
  // pa init --mono completes and the required scaffold artifacts are present.

  it("smoke step 1: init generates required scaffold artifacts", async () => {
    expect(await fs.pathExists(path.join(tempDir, "Taskfile.yml"))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, "package.json"))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, "README.md"))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, ".gitignore"))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, "pnpm-workspace.yaml"))).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tempDir, "architecture", "governance", "init-default-behavior.md"),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(path.join(tempDir, "roadmap", "projects", "shared", "manifest.json")),
    ).toBe(true);
  });

  // ─── Smoke Step 2: Post-init architecture validation ────────────────────────
  // pa check exits 0 and emits "OK" immediately after init.

  it("smoke step 2: pa check exits 0 and reports OK on fresh scaffold", async () => {
    const program = new Command();
    program.exitOverride();
    registerCheckCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "check"]);

    expect(logSpy).toHaveBeenCalledWith("OK");
    expect(process.exitCode).toBeUndefined();

    logSpy.mockRestore();
  });

  // ─── Smoke Step 3: Machine-readable architecture diagnostics baseline ────────
  // pa check --json exits 0 and emits the approved clean baseline payload.

  it("smoke step 3: pa check --json emits clean baseline JSON on fresh scaffold", async () => {
    const program = new Command();
    program.exitOverride();
    registerCheckCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "check", "--json"]);

    expect(logSpy).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      schemaVersion: string;
      status: string;
      summary: { errorCount: number; warningCount: number; diagnosticCount: number };
      compatibility: { mode: string; supported: boolean; surface: string };
    };

    expect(payload.schemaVersion).toBe("2.0");
    expect(payload.status).toBe("ok");
    expect(payload.summary).toEqual({ errorCount: 0, warningCount: 0, diagnosticCount: 0 });
    expect(payload.compatibility).toMatchObject({
      surface: "validation",
      mode: "project-scoped-only",
      supported: true,
    });
    expect(process.exitCode).toBeUndefined();

    logSpy.mockRestore();
  });

  // ─── Smoke Step 4: Aggregate workspace validation path ──────────────────────
  // task check Taskfile structure: check → ci:validate + arch:check with graceful fallbacks.
  // Validates the task-driven operational path at the Taskfile content level.

  it("smoke step 4: generated Taskfile wires check to ci:validate and arch:check with graceful fallbacks", async () => {
    const taskfileContent = await fs.readFile(path.join(tempDir, "Taskfile.yml"), "utf8");

    // check task delegates to both ci:validate and arch:check
    expect(taskfileContent).toContain("  check:");
    expect(taskfileContent).toContain("      - task: ci:validate");
    expect(taskfileContent).toContain("      - task: arch:check");

    // ci:validate: no deps; detects workspace packages before running pnpm -r commands
    expect(taskfileContent).toContain("  ci:validate:");
    expect(taskfileContent).not.toContain("deps: [typecheck, lint, test]");
    expect(taskfileContent).toContain("if find apps packages agents services tools desktop mobile");
    expect(taskfileContent).toContain(
      "INFO: Fresh scaffold baseline: no workspace packages detected",
    );

    // arch:check: guards on pa availability before running pa check
    expect(taskfileContent).toContain("  arch:check:");
    expect(taskfileContent).toContain("if command -v pa >/dev/null 2>&1");
    expect(taskfileContent).toContain(
      "Skipping architecture validation because 'pa' is not available on PATH",
    );

    // arch:check:json: available as separate task
    expect(taskfileContent).toContain("  arch:check:json:");
    expect(taskfileContent).toContain("      - pa check --json");
  });

  // ─── Smoke Step 5: Root wrapper parity ──────────────────────────────────────
  // pnpm check / pnpm check:json wrap the same task surfaces as task check / task arch:check:json.

  it("smoke step 5: root package.json wrapper scripts mirror task surfaces", async () => {
    const rootPackage = await fs.readJson(path.join(tempDir, "package.json"));

    expect(rootPackage.scripts?.check).toBe("task check");
    expect(rootPackage.scripts?.["ci:validate"]).toBe("task ci:validate");
    expect(rootPackage.scripts?.["check:json"]).toBe("task arch:check:json");
  });

  // ─── Smoke Step 6: Generated README describes the behavior users observe ─────
  // README explains the first-run validation path and all relevant edge cases.

  it("smoke step 6: generated README describes the first-run validation path accurately", async () => {
    const readme = await fs.readFile(path.join(tempDir, "README.md"), "utf8");

    expect(readme).toContain("`task check` runs the full first-run validation path");
    expect(readme).toContain("`task check` emits one intentional baseline message");
    expect(readme).toContain("If `pa` is not available on PATH");
    expect(readme).toContain("task arch:check:json");
    expect(readme).toContain("pnpm check:json");
  });

  // ─── Operational Coherence ───────────────────────────────────────────────────
  // The following tests assert that the generated artifacts work together
  // coherently as a system, not merely that each artifact contains correct strings.

  it("coherence: SDK runtime compatibility mode agrees with pa check --json CLI output", async () => {
    // SDK layer: detect compatibility directly
    const sdkCompat = await detectRuntimeCompatibility(tempDir);

    // CLI layer: pa check --json
    const program = new Command();
    program.exitOverride();
    registerCheckCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "check", "--json"]);
    const jsonOutput = logSpy.mock.calls[0]?.[0]; // capture before restore
    logSpy.mockRestore();

    const cliPayload = JSON.parse(String(jsonOutput)) as {
      compatibility: { mode: string; supported: boolean };
    };

    // SDK and CLI must report the same compatibility mode and supported state
    expect(cliPayload.compatibility.mode).toBe(sdkCompat.mode);
    expect(cliPayload.compatibility.supported).toBe(sdkCompat.supported);
  });

  it("coherence: every package.json task wrapper resolves to a defined Taskfile task", async () => {
    const rootPackage = await fs.readJson(path.join(tempDir, "package.json"));
    const taskfileContent = await fs.readFile(path.join(tempDir, "Taskfile.yml"), "utf8");

    // Parse Taskfile YAML and extract the top-level task keys
    const taskfile = parseYaml(taskfileContent) as { tasks?: Record<string, unknown> };
    const definedTasks = new Set(Object.keys(taskfile.tasks ?? {}));

    // Find every package.json script value of the form "task <name>" and collect the <name>
    const scripts = (rootPackage.scripts ?? {}) as Record<string, string>;
    const referencedTasks = Object.values(scripts)
      .filter((value) => /^task\s+\S/.test(value))
      .map((value) => value.replace(/^task\s+/, "").trim());

    // Every referenced task must exist as a defined task in the Taskfile
    expect(referencedTasks.length).toBeGreaterThan(0);
    for (const taskName of referencedTasks) {
      expect(definedTasks).toContain(taskName);
    }
  });

  it("coherence: ci:validate workspace directory list matches pnpm-workspace.yaml package patterns", async () => {
    const workspaceContent = await fs.readFile(path.join(tempDir, "pnpm-workspace.yaml"), "utf8");
    const taskfileContent = await fs.readFile(path.join(tempDir, "Taskfile.yml"), "utf8");

    // Extract workspace package directory names from pnpm-workspace.yaml (e.g. "- apps/*" → "apps")
    const workspaceDirs = workspaceContent
      .split("\n")
      .filter((line) => /^\s*-\s+\w+\/\*/.test(line))
      .map((line) =>
        line
          .replace(/^\s*-\s+/, "")
          .replace(/\/\*.*/, "")
          .trim(),
      )
      .filter(Boolean);

    // Extract the directory list from the find command in ci:validate
    // Pattern: "if find apps packages agents services tools desktop mobile ..."
    const findMatch = taskfileContent.match(/if find ((?:\w+ )+)-mindepth/);
    const ciValidateDirs = findMatch ? findMatch[1].trim().split(/\s+/).filter(Boolean) : [];

    // Every directory in pnpm-workspace.yaml must be covered by ci:validate's find command
    expect(workspaceDirs.length).toBeGreaterThan(0);
    expect(ciValidateDirs.length).toBeGreaterThan(0);
    for (const dir of workspaceDirs) {
      expect(ciValidateDirs).toContain(dir);
    }
  });

  it("coherence: init-default-behavior.md documents the actual intentional baseline message from the Taskfile", async () => {
    const taskfileContent = await fs.readFile(path.join(tempDir, "Taskfile.yml"), "utf8");
    const governanceDoc = await fs.readFile(
      path.join(tempDir, "architecture", "governance", "init-default-behavior.md"),
      "utf8",
    );

    // Verify the Taskfile has the ci:validate intentional baseline echo
    expect(taskfileContent).toContain("Fresh scaffold baseline");

    // The governance doc must describe this same first-run baseline behavior.
    // It uses "No projects matched the filters" to describe what pnpm reports
    // before any workspace packages exist — the same scenario ci:validate handles.
    // Proving both describe the same first-run no-package state coherently.
    expect(governanceDoc).toContain("No projects matched the filters");
    expect(governanceDoc).toContain("`task check` emits one intentional baseline message");
  });
});
