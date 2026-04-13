import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerRuntimeCommand } from "./runtime";
import { runtime as runtimeSdk } from "../../sdk";

describe("cli/commands/runtime", () => {
  let originalExitCode: string | number | null | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it("registers runtime command with list/check and mutation subcommands", () => {
    const program = new Command();
    registerRuntimeCommand(program);

    const runtimeCommand = program.commands.find((cmd) => cmd.name() === "runtime");
    expect(runtimeCommand).toBeDefined();
    expect(runtimeCommand?.commands.map((cmd) => cmd.name())).toEqual([
      "list",
      "scan",
      "register",
      "check",
      "link",
      "update",
      "enable",
      "disable",
      "default",
      "unlink",
    ]);
  });

  it("prints runtime inventory contract in json mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeList").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-inventory",
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
            enabled: true,
            default: true,
            linked: true,
            available: true,
            readiness: "ready",
            status: "ready",
            diagnostics: [],
          },
        ],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "runtime", "list", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { status: string };
    expect(payload.status).toBe("runtime-inventory");
  });

  it("prints grouped human output for runtime list", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeList").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-inventory",
        defaultProfile: "claude-planner",
        runtimes: [
          {
            runtime: "claude-cli",
            displayName: "Claude CLI",
            available: false,
            availabilitySource: "adapter-registry",
            profiles: ["claude-planner"],
          },
        ],
        profiles: [
          {
            id: "claude-planner",
            runtime: "claude-cli",
            enabled: true,
            default: true,
            linked: true,
            available: false,
            readiness: "runtime-unavailable",
            status: "not-ready",
            diagnostics: [
              {
                code: "runtime-unavailable",
                severity: "error",
                message: "Runtime is not registered in this environment.",
                nextStep: "Install runtime adapter.",
              },
            ],
          },
        ],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "runtime", "list"]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("available-runtimes:");
    expect(output).toContain("linked-unavailable-runtimes:");
    expect(output).toContain("profiles:");
    expect(output).toContain("runtime-unavailable");
  });

  it("prints readiness contract in json mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeCheck").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-readiness-check",
        checkedAt: "2026-04-03T23:40:00.000Z",
        profileId: "codex-implementer",
        profiles: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            enabled: true,
            default: true,
            linked: true,
            available: true,
            readiness: "ready",
            status: "ready",
            diagnostics: [],
          },
        ],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "runtime", "check", "codex-implementer", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { status: string };
    expect(payload.status).toBe("runtime-readiness-check");
  });

  it("prints command errors and sets non-zero exit code", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeCheck").mockResolvedValue({
      success: false,
      errors: ["Runtime profile 'missing-profile' is not linked in runtime.config.json."],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "runtime", "check", "missing-profile"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Runtime profile 'missing-profile' is not linked in runtime.config.json.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("emits structured json error envelope for runtime check --json failures", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeCheck").mockResolvedValue({
      success: false,
      errors: ["Runtime profile 'missing-profile' is not linked in runtime.config.json."],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "runtime", "check", "missing-profile", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      errors: string[];
    };
    expect(payload.success).toBe(false);
    expect(payload.errors[0]).toContain("missing-profile");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("prints mutation success in human mode for runtime link", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeLink").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        defaultProfile: "codex-implementer",
        profiles: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            model: "gpt-5.4",
            enabled: true,
          },
        ],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "runtime",
      "link",
      "codex-cli",
      "--profile",
      "codex-implementer",
      "--model",
      "gpt-5.4",
      "--default",
    ]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Linked runtime profile 'codex-implementer'.");
    expect(output).toContain("default-profile: codex-implementer");
  });

  it("emits structured json error envelope for runtime default --json failures", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeDefault").mockResolvedValue({
      success: false,
      errors: ["Runtime profile config does not exist."],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "runtime", "default", "--clear", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      success: boolean;
      errors: string[];
    };
    expect(payload.success).toBe(false);
    expect(payload.errors[0]).toContain("does not exist");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("prints runtime scan contract in json mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeScan").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-scan",
        scanStatus: "success",
        scannedAt: "2026-04-03T23:40:00.000Z",
        candidates: [
          {
            runtime: "ollama",
            displayName: "Ollama",
            confidence: "high",
            source: "adapter-probe",
            suggestedModel: "llama3.2",
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "runtime", "scan", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { status: string };
    expect(payload.status).toBe("runtime-scan");
  });

  it("requires confirmation for runtime register", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "runtime",
      "register",
      "--candidate",
      "ollama",
      "--profile",
      "ollama-local",
      "--model",
      "llama3.2",
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Confirmation required for runtime registration. Re-run with --yes.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("registers profile from scan candidate with explicit model", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeScan").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-scan",
        scanStatus: "success",
        scannedAt: "2026-04-03T23:40:00.000Z",
        candidates: [
          {
            runtime: "ollama",
            displayName: "Ollama",
            confidence: "high",
            source: "adapter-probe",
            suggestedModel: "llama3.2",
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
    });
    vi.spyOn(runtimeSdk, "runtimeConfigRead").mockResolvedValue({ success: true, data: null });
    const linkSpy = vi.spyOn(runtimeSdk, "runtimeLink").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        profiles: [{ id: "ollama-local", runtime: "ollama", model: "llama3.2", enabled: true }],
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "runtime",
      "register",
      "--candidate",
      "ollama",
      "--profile",
      "ollama-local",
      "--model",
      "llama3.2",
      "--yes",
    ]);

    expect(linkSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ollama-local", runtime: "ollama", model: "llama3.2" }),
    );
    expect(logSpy.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "Registered runtime profile 'ollama-local'",
    );
  });

  it("diagnoses duplicate profile-id conflict in runtime register", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeScan").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-scan",
        scanStatus: "success",
        scannedAt: "2026-04-03T23:40:00.000Z",
        candidates: [
          {
            runtime: "ollama",
            displayName: "Ollama",
            confidence: "high",
            source: "adapter-probe",
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
    });
    vi.spyOn(runtimeSdk, "runtimeConfigRead").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        profiles: [{ id: "ollama-local", runtime: "ollama", model: "llama3.2", enabled: true }],
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "runtime",
      "register",
      "--candidate",
      "ollama",
      "--profile",
      "ollama-local",
      "--model",
      "llama3.2",
      "--yes",
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Runtime profile 'ollama-local' already exists. Choose a unique --profile id or use 'pa runtime update'.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("requires explicit model selection or suggested model confirmation", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeScan").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-scan",
        scanStatus: "success",
        scannedAt: "2026-04-03T23:40:00.000Z",
        candidates: [
          {
            runtime: "ollama",
            displayName: "Ollama",
            confidence: "high",
            source: "adapter-probe",
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "runtime",
      "register",
      "--candidate",
      "ollama",
      "--profile",
      "ollama-local",
      "--yes",
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ERROR: Model selection is required. Pass --model <model> or explicitly confirm the suggested model with --use-suggested-model.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("rejects runtime register when scan returns ambiguous candidates for same runtime", async () => {
    const program = new Command();
    program.exitOverride();
    registerRuntimeCommand(program);

    vi.spyOn(runtimeSdk, "runtimeScan").mockResolvedValue({
      success: true,
      data: {
        schemaVersion: "2.0",
        status: "runtime-scan",
        scanStatus: "success",
        scannedAt: "2026-04-03T23:40:00.000Z",
        candidates: [
          {
            runtime: "ollama",
            displayName: "Ollama Local",
            confidence: "high",
            source: "adapter-probe",
            suggestedModel: "llama3.2",
            diagnostics: [],
          },
          {
            runtime: "ollama",
            displayName: "Ollama Remote",
            confidence: "medium",
            source: "adapter-probe",
            suggestedModel: "qwen2.5",
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test",
      "runtime",
      "register",
      "--candidate",
      "ollama",
      "--profile",
      "ollama-local",
      "--model",
      "llama3.2",
      "--yes",
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ERROR: Runtime 'ollama' has multiple discovered candidates:"),
    );
    expect(process.exitCode).toBe(1);
  });
});
