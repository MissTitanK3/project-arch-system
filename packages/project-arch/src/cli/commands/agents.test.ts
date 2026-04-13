import path from "path";
import fs from "fs-extra";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { registerAgentsCommand } from "./agents";
import { registerInitCommand } from "./init";
import { createTempDir, type TestProjectContext } from "../../test/helpers";
import { agents as agentsSdk } from "../../sdk";
import { unwrap } from "../../sdk/_utils";

describe("cli/commands/agents", () => {
  let context: TestProjectContext;
  const originalCwd = process.cwd();
  let originalExitCode: string | number | null | undefined;

  beforeEach(async () => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    context = await createTempDir();
    process.chdir(context.tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    await context.cleanup();
  });

  async function seedSkill(input: {
    sourceDir: "skills" | "user-skills";
    id: string;
    source: "builtin" | "user";
    overrides?: boolean;
    dirName?: string;
  }): Promise<void> {
    const skillDir = path.join(
      context.tempDir,
      ".arch",
      "agents-of-arch",
      input.sourceDir,
      input.dirName ?? input.id,
    );

    await fs.ensureDir(skillDir);
    await fs.writeJson(path.join(skillDir, "skill.json"), {
      schemaVersion: "2.0",
      id: input.id,
      name: `Skill ${input.id}`,
      source: input.source,
      version: "1.0.0",
      summary: `Summary ${input.id}`,
      whenToUse: ["When needed"],
      expectedOutputs: ["Useful output"],
      files: {
        system: "system.md",
        checklist: "checklist.md",
      },
      tags: ["test"],
      overrides: input.overrides ?? false,
    });
    await fs.writeFile(path.join(skillDir, "system.md"), "# system\n", "utf8");
    await fs.writeFile(path.join(skillDir, "checklist.md"), "# checklist\n", "utf8");
  }

  it("registers agents subcommands", () => {
    const program = new Command();
    registerAgentsCommand(program);

    const agentsCommand = program.commands.find((cmd) => cmd.name() === "agents");
    expect(agentsCommand).toBeDefined();
    expect(agentsCommand?.commands.map((cmd) => cmd.name())).toEqual(
      expect.arrayContaining(["list", "show", "new", "sync", "check"]),
    );
  });

  it("lists skills as stable JSON", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    await seedSkill({ sourceDir: "skills", id: "zeta", source: "builtin" });
    await seedSkill({ sourceDir: "skills", id: "alpha", source: "builtin" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agents", "list", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      schemaVersion: string;
      skills: Array<{ id: string }>;
    };

    expect(payload.schemaVersion).toBe("2.0");
    expect(payload.skills.map((skill) => skill.id)).toEqual(["alpha", "zeta"]);
  });

  it("shows a single skill in JSON mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agents", "show", "repo-map", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      skill: { id: string; source: string };
    };
    expect(payload.skill.id).toBe("repo-map");
    expect(payload.skill.source).toBe("builtin");
  });

  it("shows a single skill in human-readable mode", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agents", "show", "repo-map"]);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("repo-map (builtin)");
    expect(output).toContain("name:");
    expect(output).toContain("version:");
    expect(output).toContain("summary:");
    expect(output).toContain("directory:");
  });

  it("returns non-zero on show for unknown id", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agents", "show", "missing-id"]);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Skill not found"));
    expect(process.exitCode).toBe(1);
  });

  it("creates new user skill and prints JSON payload", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync([
      "node",
      "test",
      "agents",
      "new",
      "quality-gates",
      "--title",
      "Quality Gates",
      "--summary",
      "Quality policy skill",
      "--tags",
      "quality,policy",
      "--json",
    ]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      skillDir: string;
      manifestPath: string;
      schemaVersion: string;
    };

    expect(payload.schemaVersion).toBe("2.0");
    expect(payload.skillDir).toContain(".arch/agents-of-arch/user-skills/quality-gates");
    expect(await fs.pathExists(path.join(context.tempDir, payload.manifestPath))).toBe(true);
  });

  it("returns non-zero on new for invalid skill id", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agents", "new", "Bad_ID"]);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ERROR:"));
    expect(process.exitCode).toBe(1);
  });

  it("supports sync --check stale detection", async () => {
    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const checkProgramBefore = new Command();
    checkProgramBefore.exitOverride();
    registerAgentsCommand(checkProgramBefore);

    await checkProgramBefore.parseAsync(["node", "test", "agents", "sync", "--check"]);
    expect(logSpy).toHaveBeenCalledWith("STALE");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;

    const syncProgram = new Command();
    syncProgram.exitOverride();
    registerAgentsCommand(syncProgram);
    await syncProgram.parseAsync(["node", "test", "agents", "sync"]);

    logSpy.mockClear();

    const checkProgramAfter = new Command();
    checkProgramAfter.exitOverride();
    registerAgentsCommand(checkProgramAfter);
    await checkProgramAfter.parseAsync(["node", "test", "agents", "sync", "--check"]);
    expect(logSpy).toHaveBeenCalledWith("OK");
    expect(process.exitCode).toBeUndefined();
  });

  it("returns invalid check JSON when required referenced files are missing", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    const skillDir = path.join(context.tempDir, ".arch", "agents-of-arch", "skills", "repo-map");
    await fs.ensureDir(skillDir);
    await fs.writeJson(path.join(skillDir, "skill.json"), {
      schemaVersion: "2.0",
      id: "repo-map",
      name: "Repo Map",
      source: "builtin",
      version: "1.0.0",
      summary: "Summary",
      whenToUse: ["When needed"],
      expectedOutputs: ["Useful output"],
      files: {
        system: "missing-system.md",
        checklist: "missing-checklist.md",
      },
      tags: [],
      overrides: false,
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agents", "check", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      status: string;
      summary: { errorCount: number };
      diagnostics: Array<{ code: string }>;
    };
    expect(payload.status).toBe("invalid");
    expect(payload.summary.errorCount).toBe(2);
    expect(payload.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["PAS_SKILL_MISSING_SYSTEM_FILE", "PAS_SKILL_MISSING_CHECKLIST_FILE"]),
    );
    expect(process.exitCode).toBe(1);
  });

  it("prints errors in non-json check mode when invalid", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    const skillDir = path.join(context.tempDir, ".arch", "agents-of-arch", "skills", "repo-map");
    await fs.ensureDir(skillDir);
    await fs.writeJson(path.join(skillDir, "skill.json"), {
      schemaVersion: "2.0",
      id: "repo-map",
      name: "Repo Map",
      source: "builtin",
      version: "1.0.0",
      summary: "Summary",
      whenToUse: ["When needed"],
      expectedOutputs: ["Useful output"],
      files: {
        system: "missing-system.md",
        checklist: "missing-checklist.md",
      },
      tags: [],
      overrides: false,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agents", "check"]);

    expect(logSpy).not.toHaveBeenCalledWith("OK");
    expect(errorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("rejects unsupported agents subcommands", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    await expect(
      program.parseAsync(["node", "test", "agents", "unsupported-subcommand"]),
    ).rejects.toMatchObject({ code: "commander.unknownCommand" });
  });

  it("returns invalid check JSON for malformed manifests with PAS diagnostics", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    const skillDir = path.join(context.tempDir, ".arch", "agents-of-arch", "skills", "repo-map");
    await fs.ensureDir(skillDir);
    await fs.writeJson(path.join(skillDir, "skill.json"), {
      schemaVersion: "2.0",
      id: "repo-map",
      name: "Repo Map",
      source: "builtin",
      version: "1.0.0",
      summary: "Summary",
      whenToUse: "not-an-array",
      expectedOutputs: ["Useful output"],
      files: {
        system: "system.md",
        checklist: "checklist.md",
      },
      tags: [],
      overrides: false,
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agents", "check", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      status: string;
      diagnostics: Array<{ code: string }>;
    };
    expect(payload.status).toBe("invalid");
    expect(payload.diagnostics).toEqual([
      expect.objectContaining({ code: "PAS_SKILL_INVALID_MANIFEST" }),
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("returns invalid check JSON for override conflicts with PAS diagnostics", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    await seedSkill({ sourceDir: "skills", id: "repo-map", source: "builtin" });
    await seedSkill({ sourceDir: "user-skills", id: "repo-map", source: "user" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "agents", "check", "--json"]);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      status: string;
      diagnostics: Array<{ code: string }>;
    };
    expect(payload.status).toBe("invalid");
    expect(payload.diagnostics).toEqual([
      expect.objectContaining({ code: "PAS_SKILL_OVERRIDE_REQUIRED" }),
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("keeps CLI list --json consistent with SDK agentsList", async () => {
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);

    await seedSkill({ sourceDir: "skills", id: "alpha", source: "builtin" });
    await seedSkill({ sourceDir: "user-skills", id: "team-custom", source: "user" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await program.parseAsync(["node", "test", "agents", "list", "--json"]);

    const cliPayload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      skills: Array<{ id: string; source: string }>;
    };

    const sdkPayload = unwrap(await agentsSdk.agentsList({ cwd: context.tempDir }));

    expect(cliPayload.skills).toEqual(sdkPayload.skills);
  });

  it("supports init to agents list/check/sync-check integration flow", async () => {
    const initProgram = new Command();
    initProgram.exitOverride();
    registerInitCommand(initProgram);

    await initProgram.parseAsync(["node", "test", "init"]);

    const listProgram = new Command();
    listProgram.exitOverride();
    registerAgentsCommand(listProgram);
    const listLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await listProgram.parseAsync(["node", "test", "agents", "list", "--json"]);

    const listPayload = JSON.parse(String(listLogSpy.mock.calls[0]?.[0])) as {
      skills: Array<{ id: string }>;
    };
    expect(listPayload.skills.length).toBeGreaterThan(0);

    listLogSpy.mockRestore();
    process.exitCode = undefined;

    const checkProgram = new Command();
    checkProgram.exitOverride();
    registerAgentsCommand(checkProgram);
    const checkLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await checkProgram.parseAsync(["node", "test", "agents", "check", "--json"]);

    const checkPayload = JSON.parse(String(checkLogSpy.mock.calls[0]?.[0])) as {
      status: string;
      summary: { errorCount: number };
    };
    expect(checkPayload.status).toBe("valid");
    expect(checkPayload.summary.errorCount).toBe(0);

    checkLogSpy.mockRestore();
    process.exitCode = undefined;

    const syncProgram = new Command();
    syncProgram.exitOverride();
    registerAgentsCommand(syncProgram);
    const syncLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await syncProgram.parseAsync(["node", "test", "agents", "sync", "--check"]);

    expect(syncLogSpy).toHaveBeenCalledWith("OK");
    expect(process.exitCode).toBeUndefined();
  });
});
