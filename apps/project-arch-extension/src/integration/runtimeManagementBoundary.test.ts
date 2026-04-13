import { describe, expect, it, vi } from "vitest";
import type {
  ProjectArchBoundary,
  ProjectArchRuntimeInventoryListResult,
  ProjectArchRuntimeReadinessCheckResult,
  ProjectArchRuntimeScanResult,
} from "./projectArchBoundary";
import {
  EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY,
  buildRuntimeManagementInventoryViewModel,
  buildRuntimeManagementReadinessViewModel,
  buildRuntimeManagementScanViewModel,
  loadRuntimeManagementInventoryViewModel,
  loadRuntimeManagementReadinessViewModel,
  loadRuntimeManagementScanViewModel,
  mapRuntimeManagementCandidateViewModel,
} from "./runtimeManagementBoundary";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptyInventory: ProjectArchRuntimeInventoryListResult = {
  schemaVersion: "2.0",
  status: "runtime-inventory",
  generatedAt: "2026-04-04T00:00:00.000Z",
  runtimes: [],
  profiles: [],
};

const inventoryWithReadyProfile: ProjectArchRuntimeInventoryListResult = {
  schemaVersion: "2.0",
  status: "runtime-inventory",
  generatedAt: "2026-04-04T00:00:00.000Z",
  projectRoot: "/repo",
  defaultProfile: "codex-implementer",
  runtimes: [
    {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      available: true,
      availabilitySource: "adapter-registry",
      profiles: ["codex-implementer"],
    },
  ],
  profiles: [
    {
      id: "codex-implementer",
      runtime: "codex-cli",
      model: "codex-1",
      enabled: true,
      default: true,
      linked: true,
      available: true,
      readiness: "ready",
      status: "active",
      diagnostics: [],
    },
  ],
  summary: { total: 1, ready: 1, blocked: 0, disabled: 0 },
};

const inventoryWithBlockedProfile: ProjectArchRuntimeInventoryListResult = {
  schemaVersion: "2.0",
  status: "runtime-inventory",
  generatedAt: "2026-04-04T00:00:00.000Z",
  projectRoot: "/repo",
  runtimes: [
    {
      runtime: "openai",
      displayName: "OpenAI",
      available: true,
      availabilitySource: "adapter-registry",
      profiles: ["openai-planner"],
    },
  ],
  profiles: [
    {
      id: "openai-planner",
      runtime: "openai",
      model: "gpt-5",
      enabled: true,
      default: false,
      linked: true,
      available: true,
      readiness: "missing-auth",
      status: "not-ready",
      diagnostics: [
        {
          code: "MISSING_AUTH",
          severity: "error",
          message: "OPENAI_API_KEY is not set.",
          nextStep: "Set the OPENAI_API_KEY environment variable.",
        },
      ],
    },
  ],
  summary: { total: 1, ready: 0, blocked: 1, disabled: 0 },
};

const inventoryWithMixedProfiles: ProjectArchRuntimeInventoryListResult = {
  schemaVersion: "2.0",
  status: "runtime-inventory",
  generatedAt: "2026-04-04T00:00:00.000Z",
  projectRoot: "/repo",
  defaultProfile: "codex-implementer",
  runtimes: [
    {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      available: true,
      availabilitySource: "adapter-registry",
      profiles: ["codex-implementer"],
    },
    {
      runtime: "openai",
      displayName: "OpenAI",
      available: true,
      availabilitySource: "adapter-registry",
      profiles: ["openai-planner", "openai-disabled"],
    },
  ],
  profiles: [
    {
      id: "codex-implementer",
      runtime: "codex-cli",
      model: "codex-1",
      enabled: true,
      default: true,
      linked: true,
      available: true,
      readiness: "ready",
      status: "active",
      diagnostics: [],
    },
    {
      id: "openai-planner",
      runtime: "openai",
      model: "gpt-5",
      enabled: true,
      default: false,
      linked: true,
      available: true,
      readiness: "missing-auth",
      status: "not-ready",
      diagnostics: [
        {
          code: "MISSING_AUTH",
          severity: "error",
          message: "OPENAI_API_KEY is not set.",
        },
      ],
    },
    {
      id: "openai-disabled",
      runtime: "openai",
      model: "gpt-4.1",
      enabled: false,
      default: false,
      linked: true,
      available: true,
      readiness: "disabled",
      status: "disabled",
      diagnostics: [],
    },
  ],
  summary: { total: 3, ready: 1, blocked: 1, disabled: 1 },
};

const scanWithCandidates: ProjectArchRuntimeScanResult = {
  schemaVersion: "2.0",
  status: "runtime-scan",
  scanStatus: "success",
  scannedAt: "2026-04-04T01:00:00.000Z",
  candidates: [
    {
      runtime: "codex-cli",
      displayName: "Codex CLI",
      confidence: "high",
      source: "adapter-registry",
      suggestedModel: "codex-1",
      diagnostics: [],
    },
    {
      runtime: "jan-local",
      displayName: "Jan (local)",
      confidence: "medium",
      source: "config-file",
      suggestedModel: "mistral-7b",
      diagnostics: [{ code: "PAA104", severity: "warning", message: "Model not verified." }],
    },
  ],
  diagnostics: [],
};

// ---------------------------------------------------------------------------
// Boundary metadata
// ---------------------------------------------------------------------------

describe("runtimeManagementBoundary", () => {
  describe("EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY", () => {
    it("publishes explicit runtime-management authority boundary metadata", () => {
      expect(EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.authority).toBe("project-arch-cli-json");
      expect(EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.inventoryCommand).toBe("pa runtime list --json");
      expect(EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.readinessCommand).toBe(
        "pa runtime check <profileId> --json",
      );
      expect(EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.scanCommand).toBe("pa runtime scan --json");
      expect(EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY.mode).toBe("runtime-management");
    });
  });

  // -------------------------------------------------------------------------
  // Empty inventory
  // -------------------------------------------------------------------------

  describe("empty inventory", () => {
    it("produces an empty view model with zero summary counts", () => {
      const model = buildRuntimeManagementInventoryViewModel(emptyInventory);

      expect(model.runtimes).toHaveLength(0);
      expect(model.profiles).toHaveLength(0);
      expect(model.summary.totalRuntimes).toBe(0);
      expect(model.summary.availableRuntimes).toBe(0);
      expect(model.summary.totalProfiles).toBe(0);
      expect(model.summary.readyProfiles).toBe(0);
      expect(model.summary.blockedProfiles).toBe(0);
      expect(model.summary.disabledProfiles).toBe(0);
    });

    it("carries the boundary source reference", () => {
      const model = buildRuntimeManagementInventoryViewModel(emptyInventory);
      expect(model.source).toBe(EXTENSION_RUNTIME_MANAGEMENT_BOUNDARY);
    });

    it("carries no defaultProfile when inventory has none", () => {
      const model = buildRuntimeManagementInventoryViewModel(emptyInventory);
      expect(model.defaultProfile).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Ready profile
  // -------------------------------------------------------------------------

  describe("ready profile", () => {
    it("maps a ready profile with correct readiness summary", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);

      expect(model.profiles).toHaveLength(1);
      const profile = model.profiles[0];
      expect(profile.readiness).toBe("ready");
      expect(profile.readinessSummary).toBe("Ready to launch.");
    });

    it("includes disable and inspect affordances for an enabled ready profile", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);
      const profile = model.profiles[0];
      const kinds = profile.affordances.map((a) => a.kind);

      expect(kinds).toContain("disable");
      expect(kinds).toContain("inspect");
      expect(kinds).not.toContain("enable");
    });

    it("does not include set-default affordance for the default profile", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);
      const profile = model.profiles[0];
      const kinds = profile.affordances.map((a) => a.kind);

      expect(profile.isDefault).toBe(true);
      expect(kinds).not.toContain("set-default");
    });

    it("resolves runtimeDisplayName from inventory runtimes", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);
      expect(model.profiles[0].runtimeDisplayName).toBe("Codex CLI");
    });

    it("produces correct summary for single ready profile", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);
      expect(model.summary.readyProfiles).toBe(1);
      expect(model.summary.blockedProfiles).toBe(0);
      expect(model.summary.disabledProfiles).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Blocked profile
  // -------------------------------------------------------------------------

  describe("blocked profile", () => {
    it("maps a blocked profile with diagnostic message as readiness summary", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithBlockedProfile);

      expect(model.profiles).toHaveLength(1);
      const profile = model.profiles[0];
      expect(profile.readiness).toBe("missing-auth");
      expect(profile.readinessSummary).toBe("OPENAI_API_KEY is not set.");
    });

    it("includes enable affordance for a disabled profile", () => {
      const { profiles } = buildRuntimeManagementInventoryViewModel(inventoryWithMixedProfiles);
      const disabledProfile = profiles.find((p) => p.id === "openai-disabled");

      expect(disabledProfile).toBeDefined();
      const kinds = disabledProfile!.affordances.map((a) => a.kind);
      expect(kinds).toContain("enable");
      expect(kinds).not.toContain("disable");
    });

    it("includes set-default affordance for a non-default profile", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithBlockedProfile);
      const profile = model.profiles[0];
      const kinds = profile.affordances.map((a) => a.kind);

      expect(profile.isDefault).toBe(false);
      expect(kinds).toContain("set-default");
    });

    it("includes inspect affordance with pa runtime check command", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithBlockedProfile);
      const profile = model.profiles[0];
      const inspectAffordance = profile.affordances.find((a) => a.kind === "inspect");

      expect(inspectAffordance?.command).toBe(`pa runtime check ${profile.id} --json`);
    });

    it("produces correct summary for single blocked profile", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithBlockedProfile);
      expect(model.summary.readyProfiles).toBe(0);
      expect(model.summary.blockedProfiles).toBe(1);
      expect(model.summary.disabledProfiles).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed profiles - summary counts
  // -------------------------------------------------------------------------

  describe("mixed profiles summary", () => {
    it("counts ready, blocked, and disabled profiles separately", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithMixedProfiles);

      expect(model.summary.totalProfiles).toBe(3);
      expect(model.summary.readyProfiles).toBe(1);
      expect(model.summary.blockedProfiles).toBe(1);
      expect(model.summary.disabledProfiles).toBe(1);
    });

    it("counts available runtimes separately from total runtimes", () => {
      const model = buildRuntimeManagementInventoryViewModel({
        ...inventoryWithMixedProfiles,
        runtimes: [
          ...inventoryWithMixedProfiles.runtimes,
          {
            runtime: "lm-studio",
            displayName: "LM Studio",
            available: false,
            availabilitySource: "adapter-registry",
            profiles: [],
          },
        ],
      });

      expect(model.summary.totalRuntimes).toBe(3);
      expect(model.summary.availableRuntimes).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime view model
  // -------------------------------------------------------------------------

  describe("mapRuntimeManagementRuntimeViewModel", () => {
    it("counts ready profiles for the runtime", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithMixedProfiles);
      const openaiRuntime = model.runtimes.find((r) => r.runtime === "openai");

      expect(openaiRuntime?.linkedProfileCount).toBe(2);
      expect(openaiRuntime?.readyProfileCount).toBe(0);
    });

    it("carries availability source from adapter registry", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);
      expect(model.runtimes[0].availabilitySource).toBe("adapter-registry");
    });
  });

  // -------------------------------------------------------------------------
  // Discovered-but-unlinked candidates
  // -------------------------------------------------------------------------

  describe("mapRuntimeManagementCandidateViewModel", () => {
    it("marks an unlinked candidate with alreadyLinked false and register command", () => {
      const candidate = mapRuntimeManagementCandidateViewModel(
        {
          runtime: "jan-local",
          displayName: "Jan (local)",
          confidence: "medium",
          source: "config-file",
          suggestedModel: "mistral-7b",
          diagnostics: [],
        },
        new Set(["codex-cli"]),
      );

      expect(candidate.alreadyLinked).toBe(false);
      expect(candidate.registerCommand).toContain("pa runtime link jan-local --profile <id>");
      expect(candidate.registerCommand).toContain("mistral-7b");
    });

    it("marks a candidate for an already-linked runtime with alreadyLinked true", () => {
      const candidate = mapRuntimeManagementCandidateViewModel(
        {
          runtime: "codex-cli",
          displayName: "Codex CLI",
          confidence: "high",
          source: "adapter-registry",
          diagnostics: [],
        },
        new Set(["codex-cli"]),
      );

      expect(candidate.alreadyLinked).toBe(true);
      expect(candidate.registerCommand).toBe("pa runtime link codex-cli --profile <id>");
    });

    it("omits --model flag when no suggestedModel is present", () => {
      const candidate = mapRuntimeManagementCandidateViewModel(
        {
          runtime: "ollama",
          displayName: "Ollama",
          confidence: "high",
          source: "adapter-registry",
          diagnostics: [],
        },
        new Set(),
      );

      expect(candidate.alreadyLinked).toBe(false);
      expect(candidate.registerCommand).toBe("pa runtime link ollama --profile main");
    });

    it("preserves source, confidence, and diagnostics from the scan candidate", () => {
      const candidate = mapRuntimeManagementCandidateViewModel(
        {
          runtime: "lm-studio",
          displayName: "LM Studio",
          confidence: "low",
          source: "adapter-probe",
          diagnostics: [{ code: "PAA001", severity: "warning", message: "Probe timeout." }],
        },
        new Set(),
      );

      expect(candidate.confidence).toBe("low");
      expect(candidate.source).toBe("adapter-probe");
      expect(candidate.diagnostics).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Readiness view model
  // -------------------------------------------------------------------------

  describe("buildRuntimeManagementReadinessViewModel", () => {
    const readinessFixture: ProjectArchRuntimeReadinessCheckResult = {
      schemaVersion: "2.0",
      status: "runtime-readiness-check",
      checkedAt: "2026-04-04T00:00:00.000Z",
      profileId: "codex-implementer",
      profiles: [
        {
          id: "codex-implementer",
          runtime: "codex-cli",
          model: "codex-1",
          enabled: true,
          default: true,
          linked: true,
          available: true,
          readiness: "ready",
          status: "active",
          diagnostics: [],
        },
      ],
    };

    it("reports allReady true when all profiles are ready", () => {
      const model = buildRuntimeManagementReadinessViewModel(readinessFixture);
      expect(model.allReady).toBe(true);
      expect(model.blockedCount).toBe(0);
    });

    it("reports allReady false when a blocked profile is present", () => {
      const model = buildRuntimeManagementReadinessViewModel({
        ...readinessFixture,
        profiles: [
          {
            ...readinessFixture.profiles[0],
            readiness: "missing-model" as const,
            status: "not-ready" as const,
            diagnostics: [{ code: "PAA002", severity: "error", message: "No model set." }],
          },
        ],
      });
      expect(model.allReady).toBe(false);
      expect(model.blockedCount).toBe(1);
    });

    it("carries checkedAt and profileId from the readiness result", () => {
      const model = buildRuntimeManagementReadinessViewModel(readinessFixture);
      expect(model.checkedAt).toBe("2026-04-04T00:00:00.000Z");
      expect(model.profileId).toBe("codex-implementer");
    });

    it("resolves runtimeDisplayName from supplied inventory", () => {
      const model = buildRuntimeManagementReadinessViewModel(
        readinessFixture,
        inventoryWithReadyProfile,
      );
      expect(model.profiles[0].runtimeDisplayName).toBe("Codex CLI");
    });

    it("falls back to runtime id as displayName when no inventory is supplied", () => {
      const model = buildRuntimeManagementReadinessViewModel(readinessFixture);
      expect(model.profiles[0].runtimeDisplayName).toBe("codex-cli");
    });
  });

  // -------------------------------------------------------------------------
  // Scan view model
  // -------------------------------------------------------------------------

  describe("buildRuntimeManagementScanViewModel", () => {
    it("maps scan candidates and marks already-linked runtimes", () => {
      const model = buildRuntimeManagementScanViewModel(scanWithCandidates, ["codex-cli"]);

      expect(model.scanStatus).toBe("success");
      expect(model.scannedAt).toBe("2026-04-04T01:00:00.000Z");
      expect(model.candidates).toHaveLength(2);
      expect(model.candidates.find((c) => c.runtime === "codex-cli")?.alreadyLinked).toBe(true);
      expect(model.candidates.find((c) => c.runtime === "jan-local")?.alreadyLinked).toBe(false);
    });

    it("carries top-level diagnostics from the scan result", () => {
      const model = buildRuntimeManagementScanViewModel({
        ...scanWithCandidates,
        diagnostics: [{ code: "PAA900", severity: "warning", message: "Partial scan." }],
      });

      expect(model.diagnostics).toHaveLength(1);
      expect(model.diagnostics[0]?.message).toBe("Partial scan.");
    });
  });

  // -------------------------------------------------------------------------
  // Async loaders
  // -------------------------------------------------------------------------

  describe("loadRuntimeManagementInventoryViewModel", () => {
    it("delegates to boundary.readRuntimeInventoryList and shapes the result", async () => {
      const mockBoundary: ProjectArchBoundary = {
        transport: "cli-json",
        cliCommand: "pa",
        runCliJson: vi.fn(),
        parseArtifact: vi.fn(),
        parseResultBundle: vi.fn(),
        parseRuntimeInventoryListResult: vi.fn(),
        parseRuntimeReadinessCheckResult: vi.fn(),
        parseRuntimeScanResult: vi.fn(),
        readRuntimeInventoryList: vi.fn(async () => inventoryWithReadyProfile),
        readRuntimeReadinessCheck: vi.fn(),
        readRuntimeScan: vi.fn(),
      };

      const model = await loadRuntimeManagementInventoryViewModel({
        boundary: mockBoundary,
        cwd: "/repo",
      });

      expect(mockBoundary.readRuntimeInventoryList).toHaveBeenCalledWith({ cwd: "/repo" });
      expect(model.profiles).toHaveLength(1);
      expect(model.profiles[0].readiness).toBe("ready");
    });
  });

  describe("loadRuntimeManagementReadinessViewModel", () => {
    it("delegates to boundary.readRuntimeReadinessCheck with profileId", async () => {
      const readinessResult: ProjectArchRuntimeReadinessCheckResult = {
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-04T00:00:00.000Z",
        profileId: "codex-implementer",
        profiles: [],
      };

      const mockBoundary: ProjectArchBoundary = {
        transport: "cli-json",
        cliCommand: "pa",
        runCliJson: vi.fn(),
        parseArtifact: vi.fn(),
        parseResultBundle: vi.fn(),
        parseRuntimeInventoryListResult: vi.fn(),
        parseRuntimeReadinessCheckResult: vi.fn(),
        parseRuntimeScanResult: vi.fn(),
        readRuntimeInventoryList: vi.fn(),
        readRuntimeReadinessCheck: vi.fn(async () => readinessResult),
        readRuntimeScan: vi.fn(),
      };

      const model = await loadRuntimeManagementReadinessViewModel({
        boundary: mockBoundary,
        cwd: "/repo",
        profileId: "codex-implementer",
      });

      expect(mockBoundary.readRuntimeReadinessCheck).toHaveBeenCalledWith({
        cwd: "/repo",
        profileId: "codex-implementer",
      });
      expect(model.profileId).toBe("codex-implementer");
      expect(model.allReady).toBe(true);
    });
  });

  describe("loadRuntimeManagementScanViewModel", () => {
    it("delegates to boundary.readRuntimeScan and shapes candidates", async () => {
      const mockBoundary: ProjectArchBoundary = {
        transport: "cli-json",
        cliCommand: "pa",
        runCliJson: vi.fn(),
        parseArtifact: vi.fn(),
        parseResultBundle: vi.fn(),
        parseRuntimeInventoryListResult: vi.fn(),
        parseRuntimeReadinessCheckResult: vi.fn(),
        parseRuntimeScanResult: vi.fn(),
        readRuntimeInventoryList: vi.fn(),
        readRuntimeReadinessCheck: vi.fn(),
        readRuntimeScan: vi.fn(async () => scanWithCandidates),
      };

      const model = await loadRuntimeManagementScanViewModel({
        boundary: mockBoundary,
        cwd: "/repo",
        linkedRuntimeIds: ["codex-cli"],
      });

      expect(mockBoundary.readRuntimeScan).toHaveBeenCalledWith({ cwd: "/repo" });
      expect(model.scanStatus).toBe("success");
      expect(model.candidates.find((c) => c.runtime === "codex-cli")?.alreadyLinked).toBe(true);
      expect(model.candidates.find((c) => c.runtime === "jan-local")?.alreadyLinked).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // View-model distinctness from RunsPanel types
  // -------------------------------------------------------------------------

  describe("view-model separation from run-review concerns", () => {
    it("RuntimeManagementInventoryViewModel has no launch-decision fields", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);

      // These keys belong to the runs-panel runtime profiles model, not management
      expect(model).not.toHaveProperty("decision");
      expect(model).not.toHaveProperty("options");
      expect(model).not.toHaveProperty("loadState");
      expect(model).not.toHaveProperty("selectionState");
    });

    it("RuntimeManagementProfileViewModel has affordances that run-panel options do not", () => {
      const model = buildRuntimeManagementInventoryViewModel(inventoryWithReadyProfile);
      const profile = model.profiles[0];

      // Management-specific shape
      expect(profile).toHaveProperty("affordances");
      expect(profile).toHaveProperty("runtimeDisplayName");
      expect(profile).toHaveProperty("readinessSummary");

      // Launch-panel specific field absent from management view model
      expect(profile).not.toHaveProperty("eligibility");
      expect(profile).not.toHaveProperty("inlineSummary");
    });
  });
});
