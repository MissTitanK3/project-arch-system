import { describe, expect, it } from "vitest";
import {
  HOST_TO_WEBVIEW_MESSAGE_TYPES,
  isHostToWebviewMessage,
  isWebviewToHostMessage,
  WEBVIEW_TO_HOST_MESSAGE_TYPES,
} from "./artifactBrowserMessageContracts";

describe("WEBVIEW_TO_HOST_MESSAGE_TYPES", () => {
  it("contains all expected webview-to-host message types", () => {
    const expected = [
      "openEdit",
      "openPreview",
      "copyPath",
      "openArtifactInspector",
      "revealInExplorer",
      "deleteFile",
      "deleteDirectory",
      "runCommand",
      "launchTask",
      "stageChatCommand",
      "stageChatSendIntent",
      "stageChatStopResponse",
      "updateWorkflowChecklistItem",
      "createDiscoveredFromSelectedTask",
      "createLaneTask",
      "refreshRunsShellData",
      "refreshRuntimesShellData",
      "runtimeProfileMutation",
      "refreshLifecycleShellData",
      "refreshCommandCatalogShellData",
      "lifecycleStageRemove",
      "commandCatalogStageCommand",
    ];

    for (const type of expected) {
      expect(WEBVIEW_TO_HOST_MESSAGE_TYPES.has(type as never)).toBe(true);
    }

    expect(WEBVIEW_TO_HOST_MESSAGE_TYPES.size).toBe(expected.length);
  });
});

describe("HOST_TO_WEBVIEW_MESSAGE_TYPES", () => {
  it("contains all expected host-to-webview message types", () => {
    const expected = ["stageChatRuntimeResponse", "stageChatRuntimeState"];

    for (const type of expected) {
      expect(HOST_TO_WEBVIEW_MESSAGE_TYPES.has(type as never)).toBe(true);
    }

    expect(HOST_TO_WEBVIEW_MESSAGE_TYPES.size).toBe(expected.length);
  });
});

describe("isWebviewToHostMessage", () => {
  it("returns false for null and undefined", () => {
    expect(isWebviewToHostMessage(null)).toBe(false);
    expect(isWebviewToHostMessage(undefined)).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isWebviewToHostMessage("openEdit")).toBe(false);
    expect(isWebviewToHostMessage(42)).toBe(false);
    expect(isWebviewToHostMessage(true)).toBe(false);
  });

  it("returns false for an object without a type field", () => {
    expect(isWebviewToHostMessage({ relativePath: "feedback/doc.md" })).toBe(false);
  });

  it("returns false for an object with an unknown type string", () => {
    expect(isWebviewToHostMessage({ type: "unknownAction" })).toBe(false);
  });

  it("returns false for an object with a host-to-webview type", () => {
    expect(isWebviewToHostMessage({ type: "stageChatRuntimeState" })).toBe(false);
    expect(isWebviewToHostMessage({ type: "stageChatRuntimeResponse" })).toBe(false);
  });

  it.each([
    { type: "openEdit", relativePath: "feedback/doc.md" },
    { type: "openPreview", relativePath: "feedback/doc.md" },
    { type: "copyPath", relativePath: "feedback/doc.md" },
    { type: "openArtifactInspector", relativePath: "feedback/doc.md" },
    { type: "revealInExplorer", relativePath: "feedback/doc.md" },
    { type: "deleteFile", relativePath: "feedback/doc.md" },
    { type: "deleteDirectory", relativePath: "feedback" },
    { type: "runCommand", command: "pa agent run 001" },
    { type: "launchTask", taskRef: "001-example" },
    {
      type: "stageChatCommand",
      command: "projectArch.openStageChat",
      relativePath: "x.md",
      stageId: "s1",
    },
    { type: "stageChatSendIntent", relativePath: "x.md", stageId: "s1", messageText: "hello" },
    { type: "stageChatStopResponse", relativePath: "x.md", stageId: "s1" },
    { type: "updateWorkflowChecklistItem" },
    { type: "createDiscoveredFromSelectedTask" },
    { type: "createLaneTask" },
    { type: "refreshRunsShellData" },
    { type: "refreshRuntimesShellData" },
    { type: "runtimeProfileMutation", kind: "create" },
    { type: "refreshLifecycleShellData" },
    { type: "refreshCommandCatalogShellData" },
    { type: "lifecycleStageRemove" },
    { type: "commandCatalogStageCommand", command: "pa help commands", target: "existing" },
  ])("returns true for type='$type'", (message) => {
    expect(isWebviewToHostMessage(message)).toBe(true);
  });
});

describe("isHostToWebviewMessage", () => {
  it("returns false for null and undefined", () => {
    expect(isHostToWebviewMessage(null)).toBe(false);
    expect(isHostToWebviewMessage(undefined)).toBe(false);
  });

  it("returns false for a webview-to-host type", () => {
    expect(isHostToWebviewMessage({ type: "openEdit", relativePath: "x.md" })).toBe(false);
  });

  it.each([
    {
      type: "stageChatRuntimeResponse",
      relativePath: "x.md",
      stageId: "s1",
      stageTitle: "Stage 1",
      role: "assistant",
      content: "Done.",
      append: false,
    },
    {
      type: "stageChatRuntimeState",
      relativePath: "x.md",
      stageId: "s1",
      stageTitle: "Stage 1",
      runtimeState: "sending",
      statusMessage: "Sending…",
      canRetry: false,
      failedMessage: "",
    },
  ])("returns true for type='$type'", (message) => {
    expect(isHostToWebviewMessage(message)).toBe(true);
  });
});
