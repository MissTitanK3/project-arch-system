import path from "path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import {
  AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH,
  defaultRuntimeProfileConfig,
  inspectRuntimeProfileConfig,
  parseRuntimeProfileConfig,
  readRuntimeProfileConfig,
  runtimeProfileConfigPath,
  safeParseRuntimeProfileConfig,
  RuntimeProfileConfigPersistenceError,
  validateRuntimeProfileConfig,
  writeRuntimeProfileConfig,
} from "./runtimeProfiles";
import { createTempDir } from "../../test/helpers";

describe("core/agentRuntime/runtimeProfiles", () => {
  it("exposes the canonical runtime profile config path", () => {
    expect(AGENT_RUNTIME_PROFILE_CONFIG_RELATIVE_PATH).toBe(".project-arch/runtime.config.json");
  });

  it("resolves canonical runtime profile config absolute path", async () => {
    const context = await createTempDir();

    try {
      expect(runtimeProfileConfigPath(context.tempDir)).toBe(
        path.join(context.tempDir, ".project-arch/runtime.config.json"),
      );
    } finally {
      await context.cleanup();
    }
  });

  it("returns null when runtime profile config file does not exist", async () => {
    const context = await createTempDir();

    try {
      await expect(readRuntimeProfileConfig(context.tempDir)).resolves.toBeNull();
      await expect(inspectRuntimeProfileConfig(context.tempDir)).resolves.toEqual({
        status: "missing",
        path: ".project-arch/runtime.config.json",
        issues: [],
      });
    } finally {
      await context.cleanup();
    }
  });

  it("provides deterministic default config shape", () => {
    expect(defaultRuntimeProfileConfig()).toEqual({
      schemaVersion: "2.0",
      profiles: [],
    });
  });

  it("parses valid runtime profile config through the core helper", () => {
    const parsed = parseRuntimeProfileConfig({
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
    });

    expect(parsed.defaultProfile).toBe("codex-implementer");
  });

  it("returns unsuccessful safe parse result for invalid runtime profile config", () => {
    const parsed = safeParseRuntimeProfileConfig({
      schemaVersion: "2.0",
      defaultProfile: "missing-profile",
      profiles: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("returns explicit validation issues for contradictory config values", () => {
    expect(
      validateRuntimeProfileConfig({
        schemaVersion: "2.0",
        defaultProfile: "missing-profile",
        profiles: [],
      }),
    ).toEqual({
      status: "invalid",
      path: ".project-arch/runtime.config.json",
      issues: [
        {
          code: "invalid-schema",
          path: "defaultProfile",
          message: "defaultProfile must reference an id from profiles.",
        },
      ],
    });
  });

  it("returns explicit issue paths for duplicate profile and preferredFor values", () => {
    expect(
      validateRuntimeProfileConfig({
        schemaVersion: "2.0",
        profiles: [
          {
            id: "codex-implementer",
            runtime: "codex-cli",
            model: "gpt-5.4",
            preferredFor: ["run", "run"],
          },
          {
            id: "codex-implementer",
            runtime: "claude-cli",
            model: "claude-opus-4",
          },
        ],
      }),
    ).toEqual({
      status: "invalid",
      path: ".project-arch/runtime.config.json",
      issues: [
        {
          code: "invalid-schema",
          path: "profiles.0.preferredFor.1",
          message: "Duplicate preferredFor value 'run' is not allowed.",
        },
        {
          code: "invalid-schema",
          path: "profiles.1.id",
          message: "Duplicate runtime profile id 'codex-implementer' is not allowed.",
        },
      ],
    });
  });

  it("writes runtime profile config deterministically and reads it back", async () => {
    const context = await createTempDir();

    try {
      const written = await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          defaultProfile: "codex-implementer",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
            },
          ],
        },
        context.tempDir,
      );

      expect(written.defaultProfile).toBe("codex-implementer");

      const targetPath = runtimeProfileConfigPath(context.tempDir);
      const rawFile = await fs.readFile(targetPath, "utf8");
      expect(JSON.parse(rawFile)).toEqual(written);
      expect(rawFile.endsWith("\n")).toBe(true);

      const loaded = await readRuntimeProfileConfig(context.tempDir);
      expect(loaded).toEqual(written);
    } finally {
      await context.cleanup();
    }
  });

  it("throws explicit persistence error when existing config is malformed", async () => {
    const context = await createTempDir();

    try {
      const targetPath = runtimeProfileConfigPath(context.tempDir);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, "{ invalid", "utf8");

      await expect(readRuntimeProfileConfig(context.tempDir)).rejects.toMatchObject({
        name: "RuntimeProfileConfigPersistenceError",
        code: "PAA020",
      } satisfies Partial<RuntimeProfileConfigPersistenceError>);

      await expect(inspectRuntimeProfileConfig(context.tempDir)).resolves.toEqual({
        status: "invalid",
        path: ".project-arch/runtime.config.json",
        issues: [
          expect.objectContaining({
            code: "invalid-json",
            path: "root",
          }),
        ],
      });
    } finally {
      await context.cleanup();
    }
  });

  it("returns explicit schema issues for existing invalid runtime profile config file", async () => {
    const context = await createTempDir();

    try {
      const targetPath = runtimeProfileConfigPath(context.tempDir);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeJson(
        targetPath,
        {
          schemaVersion: "2.0",
          defaultProfile: "missing",
          profiles: [],
        },
        { spaces: 2 },
      );

      await expect(inspectRuntimeProfileConfig(context.tempDir)).resolves.toEqual({
        status: "invalid",
        path: ".project-arch/runtime.config.json",
        issues: [
          {
            code: "invalid-schema",
            path: "defaultProfile",
            message: "defaultProfile must reference an id from profiles.",
          },
        ],
      });
    } finally {
      await context.cleanup();
    }
  });

  it("throws explicit persistence error when write input is schema-invalid", async () => {
    const context = await createTempDir();

    try {
      await expect(
        writeRuntimeProfileConfig(
          {
            schemaVersion: "2.0",
            defaultProfile: "missing",
            profiles: [],
          },
          context.tempDir,
        ),
      ).rejects.toMatchObject({
        name: "RuntimeProfileConfigPersistenceError",
        code: "PAA021",
      } satisfies Partial<RuntimeProfileConfigPersistenceError>);
    } finally {
      await context.cleanup();
    }
  });

  it("applies schema defaults during write and read round-trips", async () => {
    const context = await createTempDir();

    try {
      const written = await writeRuntimeProfileConfig(
        {
          schemaVersion: "2.0",
          defaultProfile: "codex-implementer",
          profiles: [
            {
              id: "codex-implementer",
              runtime: "codex-cli",
              model: "gpt-5.4",
            },
          ],
        },
        context.tempDir,
      );

      expect(written.profiles[0]?.enabled).toBe(true);

      const loaded = await readRuntimeProfileConfig(context.tempDir);
      expect(loaded?.profiles[0]?.enabled).toBe(true);
    } finally {
      await context.cleanup();
    }
  });
});
