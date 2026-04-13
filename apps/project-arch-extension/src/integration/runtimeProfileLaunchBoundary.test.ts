import { describe, expect, it, vi } from "vitest";
import type {
  ProjectArchBoundary,
  ProjectArchRuntimeInventoryListResult,
} from "./projectArchBoundary";
import {
  EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY,
  buildRuntimeDiagnosticPresentation,
  buildRuntimeProfileLaunchBoundaryModel,
  loadRuntimeProfileLaunchBoundaryModel,
} from "./runtimeProfileLaunchBoundary";

const inventoryFixture: ProjectArchRuntimeInventoryListResult = {
  schemaVersion: "2.0",
  status: "runtime-inventory",
  generatedAt: "2026-01-01T00:00:00.000Z",
  projectRoot: "/repo",
  runtimes: [
    {
      runtime: "openai",
      displayName: "OpenAI",
      available: true,
      availabilitySource: "adapter-registry",
      profiles: ["disabled-fallback", "ready-default"],
    },
  ],
  profiles: [
    {
      id: "ready-default",
      runtime: "openai",
      model: "gpt-5",
      default: true,
      enabled: true,
      linked: true,
      available: true,
      origin: "workspace" as const,
      status: "active" as const,
      readiness: "ready" as const,
      diagnostics: [],
    },
    {
      id: "disabled-fallback",
      runtime: "openai",
      model: "gpt-4.1",
      default: false,
      enabled: false,
      linked: true,
      available: true,
      origin: "workspace" as const,
      status: "disabled" as const,
      readiness: "disabled" as const,
      diagnostics: [
        {
          code: "PROFILE_DISABLED",
          severity: "warning" as const,
          message: "Profile disabled",
        },
      ],
    },
  ],
  defaultProfile: "ready-default",
  summary: {
    total: 2,
    ready: 1,
    blocked: 0,
    disabled: 1,
  },
};

describe("runtimeProfileLaunchBoundary", () => {
  it("publishes explicit runtime consumption boundary metadata", () => {
    expect(EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY.inventoryCommand).toBe("pa runtime list --json");
    expect(EXTENSION_RUNTIME_PROFILE_READ_BOUNDARY.readinessCommand).toBe(
      "pa runtime check <profileId> --json",
    );
  });

  it("selects ready default profile when available", () => {
    const model = buildRuntimeProfileLaunchBoundaryModel(inventoryFixture);

    expect(model.decision.state).toBe("selected-default-ready");
    expect(model.decision.selectedProfileId).toBe("ready-default");
    expect(model.options).toHaveLength(2);
    expect(model.options[0].eligibility).toBe("ready");
  });

  it("falls back when default profile is disabled", () => {
    const model = buildRuntimeProfileLaunchBoundaryModel({
      ...inventoryFixture,
      defaultProfile: "disabled-fallback",
      profiles: [
        {
          ...inventoryFixture.profiles[0],
          default: false,
        },
        {
          ...inventoryFixture.profiles[1],
          default: true,
        },
      ],
    });

    expect(model.decision.state).toBe("default-disabled-fallback-ready");
    expect(model.decision.selectedProfileId).toBe("ready-default");
  });

  it("returns empty inventory state when no profiles are linked", () => {
    const model = buildRuntimeProfileLaunchBoundaryModel({
      ...inventoryFixture,
      runtimes: [],
      profiles: [],
      defaultProfile: undefined,
      summary: {
        total: 0,
        ready: 0,
        blocked: 0,
        disabled: 0,
      },
    });

    expect(model.decision.state).toBe("empty-inventory");
    expect(model.decision.selectedProfileId).toBeUndefined();
  });

  it("returns drill-in diagnostics for non-ready profiles", () => {
    const model = buildRuntimeProfileLaunchBoundaryModel({
      ...inventoryFixture,
      profiles: [
        {
          ...inventoryFixture.profiles[0],
          id: "blocked-default",
          default: true,
          linked: true,
          available: true,
          readiness: "blocked",
          diagnostics: [
            {
              code: "MISSING_API_KEY",
              severity: "error",
              message: "API key is missing.",
            },
          ],
        },
      ],
      defaultProfile: "blocked-default",
      summary: {
        total: 1,
        ready: 0,
        blocked: 1,
        disabled: 0,
      },
    });

    expect(model.decision.state).toBe("default-blocked-no-ready");

    const presentation = buildRuntimeDiagnosticPresentation(model.options[0]);
    expect(presentation.mode).toBe("inline-with-drill-in");
    expect(presentation.detailsCommand).toBe("pa runtime check blocked-default --json");
  });

  it("loads inventory via bounded runtime list JSON transport", async () => {
    const readRuntimeInventoryList = vi.fn(async () => inventoryFixture);

    const boundary = {
      readRuntimeInventoryList,
    } as unknown as ProjectArchBoundary;

    const model = await loadRuntimeProfileLaunchBoundaryModel({
      boundary,
      cwd: "/repo",
    });

    expect(readRuntimeInventoryList).toHaveBeenCalledWith({ cwd: "/repo" });
    expect(model.decision.state).toBe("selected-default-ready");
  });
});
