import { describe, expect, it, vi } from "vitest";
import {
  buildProfileLinkCommand,
  buildProfileUnlinkCommand,
  buildProfileUpdateModelCommand,
  runCreateProfileFlow,
  runUnlinkProfileFlow,
  runUpdateProfileModelFlow,
} from "./profileMutationFlows";

// ---------------------------------------------------------------------------
// buildProfileLinkCommand
// ---------------------------------------------------------------------------

describe("profileMutationFlows", () => {
  describe("buildProfileLinkCommand", () => {
    it("builds a minimal link command with required fields only", () => {
      const cmd = buildProfileLinkCommand({
        runtime: "codex-cli",
        profileId: "my-profile",
        model: "codex-1",
      });
      expect(cmd).toBe("pa runtime link codex-cli --profile my-profile --model codex-1");
    });

    it("appends --label when label is provided", () => {
      const cmd = buildProfileLinkCommand({
        runtime: "openai",
        profileId: "gpt-planner",
        model: "gpt-4o",
        label: "Planning Agent",
      });
      expect(cmd).toContain('--label "Planning Agent"');
    });

    it("appends --purpose when purpose is provided", () => {
      const cmd = buildProfileLinkCommand({
        runtime: "openai",
        profileId: "gpt-writer",
        model: "gpt-4o",
        purpose: "code-generation",
      });
      expect(cmd).toContain('--purpose "code-generation"');
    });

    it("appends --default when setDefault is true", () => {
      const cmd = buildProfileLinkCommand({
        runtime: "openai",
        profileId: "gpt-default",
        model: "gpt-4o",
        setDefault: true,
      });
      expect(cmd).toContain("--default");
    });

    it("omits --default when setDefault is false or absent", () => {
      const cmd = buildProfileLinkCommand({
        runtime: "openai",
        profileId: "gpt-optional",
        model: "gpt-4o",
        setDefault: false,
      });
      expect(cmd).not.toContain("--default");
    });

    it("includes all optional flags when all are provided", () => {
      const cmd = buildProfileLinkCommand({
        runtime: "codex-cli",
        profileId: "full-profile",
        model: "codex-1",
        label: "Full",
        purpose: "review",
        setDefault: true,
      });
      expect(cmd).toContain("pa runtime link codex-cli --profile full-profile --model codex-1");
      expect(cmd).toContain('--label "Full"');
      expect(cmd).toContain('--purpose "review"');
      expect(cmd).toContain("--default");
    });
  });

  // -------------------------------------------------------------------------
  // buildProfileUpdateModelCommand
  // -------------------------------------------------------------------------

  describe("buildProfileUpdateModelCommand", () => {
    it("builds a correct update command with model flag", () => {
      const cmd = buildProfileUpdateModelCommand({
        profileId: "codex-implementer",
        model: "codex-2",
      });
      expect(cmd).toBe("pa runtime update codex-implementer --model codex-2");
    });

    it("preserves dashes and dots in model identifiers", () => {
      const cmd = buildProfileUpdateModelCommand({
        profileId: "my-profile",
        model: "claude-3-5-sonnet-20241022",
      });
      expect(cmd).toContain("--model claude-3-5-sonnet-20241022");
    });
  });

  // -------------------------------------------------------------------------
  // buildProfileUnlinkCommand
  // -------------------------------------------------------------------------

  describe("buildProfileUnlinkCommand", () => {
    it("builds a correct unlink command", () => {
      const cmd = buildProfileUnlinkCommand({ profileId: "openai-planner" });
      expect(cmd).toBe("pa runtime unlink openai-planner");
    });
  });

  // -------------------------------------------------------------------------
  // runCreateProfileFlow
  // -------------------------------------------------------------------------

  describe("runCreateProfileFlow", () => {
    it("stages the constructed link command when all prompts are filled", async () => {
      const windowApi = {
        showInputBox: vi
          .fn()
          .mockResolvedValueOnce("codex-cli")
          .mockResolvedValueOnce("my-new-profile")
          .mockResolvedValueOnce("codex-1"),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runCreateProfileFlow({ windowApi, stageCommand });

      expect(result).toBe("staged");
      expect(stageCommand).toHaveBeenCalledWith(
        "pa runtime link codex-cli --profile my-new-profile --model codex-1",
      );
    });

    it("returns cancelled when the user dismisses the runtime prompt", async () => {
      const windowApi = {
        showInputBox: vi.fn().mockResolvedValueOnce(undefined),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runCreateProfileFlow({ windowApi, stageCommand });

      expect(result).toBe("cancelled");
      expect(stageCommand).not.toHaveBeenCalled();
    });

    it("returns cancelled when the user dismisses the profile id prompt", async () => {
      const windowApi = {
        showInputBox: vi.fn().mockResolvedValueOnce("codex-cli").mockResolvedValueOnce(undefined),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runCreateProfileFlow({ windowApi, stageCommand });

      expect(result).toBe("cancelled");
      expect(stageCommand).not.toHaveBeenCalled();
    });

    it("returns cancelled when the user dismisses the model prompt", async () => {
      const windowApi = {
        showInputBox: vi
          .fn()
          .mockResolvedValueOnce("openai")
          .mockResolvedValueOnce("my-profile")
          .mockResolvedValueOnce(undefined),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runCreateProfileFlow({ windowApi, stageCommand });

      expect(result).toBe("cancelled");
      expect(stageCommand).not.toHaveBeenCalled();
    });

    it("pre-fills the runtime prompt when prefillRuntime is provided", async () => {
      const windowApi = {
        showInputBox: vi
          .fn()
          .mockResolvedValueOnce("codex-cli")
          .mockResolvedValueOnce("profile-b")
          .mockResolvedValueOnce("codex-1"),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      await runCreateProfileFlow({ windowApi, stageCommand, prefillRuntime: "codex-cli" });

      const firstCall = windowApi.showInputBox.mock.calls[0][0];
      expect(firstCall.value).toBe("codex-cli");
    });

    it("pre-fills the model prompt when prefillModel is provided", async () => {
      const windowApi = {
        showInputBox: vi
          .fn()
          .mockResolvedValueOnce("ollama")
          .mockResolvedValueOnce("local-profile")
          .mockResolvedValueOnce("llama3"),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };

      await runCreateProfileFlow({
        windowApi,
        stageCommand: vi.fn(),
        prefillModel: "llama3",
      });

      const thirdCall = windowApi.showInputBox.mock.calls[2][0];
      expect(thirdCall.value).toBe("llama3");
    });

    it("trims whitespace from all inputs before building the command", async () => {
      const windowApi = {
        showInputBox: vi
          .fn()
          .mockResolvedValueOnce("  openai  ")
          .mockResolvedValueOnce("  gpt-planner  ")
          .mockResolvedValueOnce("  gpt-4o  "),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      await runCreateProfileFlow({ windowApi, stageCommand });

      expect(stageCommand).toHaveBeenCalledWith(
        "pa runtime link openai --profile gpt-planner --model gpt-4o",
      );
    });
  });

  // -------------------------------------------------------------------------
  // runUpdateProfileModelFlow
  // -------------------------------------------------------------------------

  describe("runUpdateProfileModelFlow", () => {
    it("stages update command when user provides a new model", async () => {
      const windowApi = {
        showInputBox: vi.fn().mockResolvedValueOnce("gpt-4o-mini"),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runUpdateProfileModelFlow({
        profileId: "openai-planner",
        currentModel: "gpt-4o",
        windowApi,
        stageCommand,
      });

      expect(result).toBe("staged");
      expect(stageCommand).toHaveBeenCalledWith(
        "pa runtime update openai-planner --model gpt-4o-mini",
      );
    });

    it("pre-fills the input with the current model value", async () => {
      const windowApi = {
        showInputBox: vi.fn().mockResolvedValueOnce("gpt-4o-mini"),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      await runUpdateProfileModelFlow({
        profileId: "openai-planner",
        currentModel: "gpt-4o",
        windowApi,
        stageCommand,
      });

      const callArgs = windowApi.showInputBox.mock.calls[0][0];
      expect(callArgs.value).toBe("gpt-4o");
    });

    it("returns cancelled when user dismisses the model input", async () => {
      const windowApi = {
        showInputBox: vi.fn().mockResolvedValueOnce(undefined),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runUpdateProfileModelFlow({
        profileId: "codex-implementer",
        windowApi,
        stageCommand,
      });

      expect(result).toBe("cancelled");
      expect(stageCommand).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // runUnlinkProfileFlow
  // -------------------------------------------------------------------------

  describe("runUnlinkProfileFlow", () => {
    it("stages unlink command when user confirms the modal", async () => {
      const windowApi = {
        showInputBox: vi.fn(),
        showWarningMessage: vi.fn().mockResolvedValueOnce("Unlink Profile"),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runUnlinkProfileFlow({
        profileId: "codex-implementer",
        windowApi,
        stageCommand,
      });

      expect(result).toBe("staged");
      expect(stageCommand).toHaveBeenCalledWith("pa runtime unlink codex-implementer");
    });

    it("returns cancelled and does not stage when user dismisses the modal", async () => {
      const windowApi = {
        showInputBox: vi.fn(),
        showWarningMessage: vi.fn().mockResolvedValueOnce(undefined),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runUnlinkProfileFlow({
        profileId: "codex-implementer",
        windowApi,
        stageCommand,
      });

      expect(result).toBe("cancelled");
      expect(stageCommand).not.toHaveBeenCalled();
    });

    it("returns cancelled when user clicks non-confirm button", async () => {
      const windowApi = {
        showInputBox: vi.fn(),
        showWarningMessage: vi.fn().mockResolvedValueOnce("Cancel"),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      const result = await runUnlinkProfileFlow({
        profileId: "openai-planner",
        windowApi,
        stageCommand,
      });

      expect(result).toBe("cancelled");
      expect(stageCommand).not.toHaveBeenCalled();
    });

    it("shows a modal warning dialog that mentions the profile id", async () => {
      const windowApi = {
        showInputBox: vi.fn(),
        showWarningMessage: vi.fn().mockResolvedValueOnce(undefined),
        showInformationMessage: vi.fn(),
      };
      const stageCommand = vi.fn();

      await runUnlinkProfileFlow({
        profileId: "gpt-writer",
        windowApi,
        stageCommand,
      });

      const [message, options] = windowApi.showWarningMessage.mock.calls[0];
      expect(message).toContain("gpt-writer");
      expect(options).toMatchObject({ modal: true });
    });

    it("warning dialog mentions project configuration scope to clarify impact", async () => {
      const windowApi = {
        showInputBox: vi.fn(),
        showWarningMessage: vi.fn().mockResolvedValueOnce(undefined),
        showInformationMessage: vi.fn(),
      };

      await runUnlinkProfileFlow({
        profileId: "gpt-writer",
        windowApi,
        stageCommand: vi.fn(),
      });

      const [message] = windowApi.showWarningMessage.mock.calls[0];
      expect(message).toContain("project configuration");
    });
  });
});
