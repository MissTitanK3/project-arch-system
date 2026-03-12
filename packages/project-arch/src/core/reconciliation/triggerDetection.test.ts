import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { detectReconciliationTriggers, type TriggerSignals } from "./triggerDetection";

function baseSignals(overrides: Partial<TriggerSignals> = {}): TriggerSignals {
  return {
    changedFiles: [],
    taskStatus: "todo",
    codeTargets: [],
    traceLinks: [],
    evidence: [],
    tags: [],
    ...overrides,
  };
}

describe("core/reconciliation/triggerDetection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "trigger-detection-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // No triggers
  // -------------------------------------------------------------------------

  it("returns 'no reconciliation needed' when no triggers fire", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["apps/web/src/index.ts"] }),
      tempDir,
    );
    expect(result.status).toBe("no reconciliation needed");
    expect(result.firedTriggers).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Trigger: architecture-surface
  // -------------------------------------------------------------------------

  it("returns 'reconciliation required' when architecture/ files change", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["architecture/workflows/implementation-reconciliation.md"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "architecture-surface")).toBe(true);
  });

  it("returns 'reconciliation required' when codeTarget is inside architecture/", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ codeTargets: ["architecture/foundation/goals.md"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
  });

  // -------------------------------------------------------------------------
  // Trigger: module-boundary
  // -------------------------------------------------------------------------

  it("returns 'reconciliation required' when arch-domains/ files change", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["arch-domains/api.md"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "module-boundary")).toBe(true);
  });

  it("returns 'reconciliation required' when arch-model/ files change", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["arch-model/modules.json"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "module-boundary")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Trigger: schema-contract
  // -------------------------------------------------------------------------

  it("returns 'reconciliation required' when a schema file changes", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({
        changedFiles: ["packages/project-arch/src/schemas/reconciliationReport.ts"],
      }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "schema-contract")).toBe(true);
  });

  it("returns 'reconciliation required' when a .schema.json file changes", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["packages/api/src/user.schema.json"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
  });

  it("returns 'reconciliation required' when an api/ path changes", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["packages/api/src/routes.ts"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
  });

  // -------------------------------------------------------------------------
  // Trigger: terminology
  // -------------------------------------------------------------------------

  it("returns 'reconciliation required' when concept-map.json changes", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["arch-model/concept-map.json"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "terminology")).toBe(true);
  });

  it("returns 'reconciliation required' when task has terminology tag", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({ tags: ["terminology"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "terminology")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Trigger: milestone-target
  // -------------------------------------------------------------------------

  it("returns 'reconciliation required' when done task has milestone traceLink", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({
        taskStatus: "done",
        traceLinks: ["roadmap/phases/phase-1/milestones/milestone-1/manifest.json"],
      }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "milestone-target")).toBe(true);
  });

  it("does NOT fire milestone-target when task is not done", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({
        taskStatus: "in_progress",
        traceLinks: ["roadmap/phases/phase-1/milestones/milestone-1/manifest.json"],
      }),
      tempDir,
    );
    expect(result.firedTriggers.some((t) => t.name === "milestone-target")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Trigger: unresolved-drift
  // -------------------------------------------------------------------------

  it("returns 'reconciliation required' when done task has code targets but no evidence and contract trigger is present", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({
        taskStatus: "done",
        codeTargets: ["packages/api/src/routes.ts"],
        evidence: [],
      }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name === "unresolved-drift")).toBe(true);
  });

  it("does NOT fire unresolved-drift when evidence is present", async () => {
    const result = await detectReconciliationTriggers(
      baseSignals({
        taskStatus: "done",
        codeTargets: ["apps/web/src/button.tsx"],
        evidence: ["Verified button component renders correctly"],
      }),
      tempDir,
    );
    expect(result.firedTriggers.some((t) => t.name === "unresolved-drift")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Custom config
  // -------------------------------------------------------------------------

  it("applies include rule by pathPattern and elevates to required", async () => {
    const configDir = path.join(tempDir, ".project-arch");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, "reconcile.config.json"),
      JSON.stringify({
        extends: "default",
        triggers: {
          include: [{ pathPattern: "apps/web/src/critical", status: "required" }],
        },
      }),
    );

    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["apps/web/src/critical/payments.ts"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
    expect(result.firedTriggers.some((t) => t.name.startsWith("include:"))).toBe(true);
  });

  it("applies include rule by domain and elevates to required", async () => {
    const configDir = path.join(tempDir, ".project-arch");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, "reconcile.config.json"),
      JSON.stringify({
        extends: "default",
        triggers: {
          include: [{ domain: "payments", status: "required" }],
        },
      }),
    );

    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["apps/web/src/feature.ts"], tags: ["domain:payments"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation required");
  });

  it("applies exclude rule to downgrade required trigger to suggested", async () => {
    const configDir = path.join(tempDir, ".project-arch");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, "reconcile.config.json"),
      JSON.stringify({
        extends: "default",
        triggers: {
          exclude: [
            {
              trigger: "architecture-surface",
              pathPattern: "architecture/workflows/",
              downgradeTo: "suggested",
            },
          ],
        },
      }),
    );

    const result = await detectReconciliationTriggers(
      baseSignals({ changedFiles: ["architecture/workflows/implementation-reconciliation.md"] }),
      tempDir,
    );
    expect(result.status).toBe("reconciliation suggested");
  });

  it("applies override rule to disable unresolved-drift trigger", async () => {
    const configDir = path.join(tempDir, ".project-arch");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, "reconcile.config.json"),
      JSON.stringify({
        extends: "default",
        triggers: {
          overrides: [{ trigger: "unresolved-drift", status: "none" }],
        },
      }),
    );

    const result = await detectReconciliationTriggers(
      baseSignals({
        taskStatus: "done",
        codeTargets: ["apps/web/src/button.tsx"],
        evidence: [],
      }),
      tempDir,
    );
    expect(result.status).toBe("no reconciliation needed");
    expect(result.firedTriggers.some((t) => t.name === "unresolved-drift")).toBe(false);
  });
});
