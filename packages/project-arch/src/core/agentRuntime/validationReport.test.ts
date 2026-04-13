import { describe, expect, it } from "vitest";
import {
  agentValidationFindingSchema,
  agentValidationReportSchema,
  agentValidationStatusSchema,
} from "./validationReport";

describe("core/agentRuntime/validationReport", () => {
  const validReport = {
    schemaVersion: "2.0" as const,
    runId: "run-2026-03-31-001",
    taskId: "104",
    ok: false,
    status: "validation-failed" as const,
    validatedAt: "2026-03-31T12:25:00.000Z",
    violations: [
      {
        code: "PAA003",
        severity: "error" as const,
        message: "Changed file is outside allowed paths.",
        path: ".github/workflows/release.yml",
      },
    ],
    warnings: [],
    checksRun: ["scope", "required-evidence", "verification-commands", "pa-check"],
  };

  it("accepts a valid run-scoped validation report", () => {
    expect(agentValidationReportSchema.parse(validReport)).toEqual(validReport);
  });

  it("accepts warning findings and passed status", () => {
    const parsed = agentValidationReportSchema.parse({
      ...validReport,
      ok: true,
      status: "validation-passed",
      violations: [],
      warnings: [
        {
          code: "PAA007",
          severity: "warning",
          message: "Escalation review recommended before reconciliation.",
        },
      ],
    });

    expect(parsed.status).toBe("validation-passed");
    expect(parsed.warnings).toHaveLength(1);
  });

  it("rejects invalid status and empty checksRun", () => {
    expect(() => agentValidationStatusSchema.parse("failed")).toThrow();

    expect(() =>
      agentValidationReportSchema.parse({
        ...validReport,
        checksRun: [],
      }),
    ).toThrow();
  });

  it("rejects malformed findings", () => {
    expect(() =>
      agentValidationFindingSchema.parse({
        code: "PAA003",
        severity: "critical",
        message: "Changed file is outside allowed paths.",
      }),
    ).toThrow();

    expect(() =>
      agentValidationReportSchema.parse({
        ...validReport,
        warnings: [
          {
            code: "PAA005",
            severity: "warning",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects invalid run identity and timestamp values", () => {
    expect(() =>
      agentValidationReportSchema.parse({
        ...validReport,
        taskId: "task-104",
      }),
    ).toThrow();

    expect(() =>
      agentValidationReportSchema.parse({
        ...validReport,
        validatedAt: "2026-03-31",
      }),
    ).toThrow();
  });
});
