import { describe, expect, it } from "vitest";
import {
  agentEscalationNextStepSchema,
  agentEscalationOptionSchema,
  agentEscalationRequestSchema,
  agentEscalationSeveritySchema,
  agentEscalationTypeSchema,
} from "./agentEscalationRequest";

describe("schemas/agentEscalationRequest", () => {
  const validRequest = {
    schemaVersion: "2.0" as const,
    runId: "run-2026-03-31-001",
    taskId: "104",
    escalationType: "requires-new-dependency" as const,
    severity: "high" as const,
    summary:
      "Implementation would be simpler with an additional parser dependency, but dependency installation is blocked by policy.",
    details: [
      "Current contract blocks dependency installation.",
      "Existing dependencies can support a manual implementation at higher cost.",
    ],
    options: [
      {
        label: "approve dependency",
        impact: "faster implementation with broader package surface",
      },
      {
        label: "continue without dependency",
        impact: "more local implementation work",
      },
    ],
    recommendedNextStep: "create-decision-draft" as const,
    createdAt: "2026-03-31T12:10:00.000Z",
  };

  it("accepts a valid escalation request", () => {
    expect(agentEscalationRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("supports VS Code draft-oriented next steps", () => {
    expect(agentEscalationNextStepSchema.parse("create-discovered-task-draft")).toBe(
      "create-discovered-task-draft",
    );
    expect(agentEscalationNextStepSchema.parse("stop-run")).toBe("stop-run");
  });

  it("rejects unsupported escalation types and severities", () => {
    expect(() => agentEscalationTypeSchema.parse("public-api-change")).toThrow();
    expect(() => agentEscalationSeveritySchema.parse("critical")).toThrow();
  });

  it("rejects invalid task ids and timestamps", () => {
    expect(() =>
      agentEscalationRequestSchema.parse({
        ...validRequest,
        taskId: "task-104",
      }),
    ).toThrow();

    expect(() =>
      agentEscalationRequestSchema.parse({
        ...validRequest,
        createdAt: "2026-03-31",
      }),
    ).toThrow();
  });

  it("rejects empty details and options", () => {
    expect(() =>
      agentEscalationRequestSchema.parse({
        ...validRequest,
        details: [],
      }),
    ).toThrow();

    expect(() =>
      agentEscalationRequestSchema.parse({
        ...validRequest,
        options: [],
      }),
    ).toThrow();
  });

  it("rejects malformed option payloads", () => {
    expect(() =>
      agentEscalationOptionSchema.parse({
        label: "approve dependency",
      }),
    ).toThrow();
  });

  it("rejects unsupported next-step values", () => {
    expect(() => agentEscalationNextStepSchema.parse("request-human-review")).toThrow();
  });
});
