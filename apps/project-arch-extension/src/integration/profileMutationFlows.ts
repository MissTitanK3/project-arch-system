// ---------------------------------------------------------------------------
// Runtime Profile Mutation Flows
//
// Pure command-builder utilities and injectable flow runners for the
// runtime-management surface. All VS Code window interactions are injected
// so that flows are testable without a real extension host.
//
// Authority: all generated commands are `pa runtime ...` CLI invocations.
// The extension does not write project config directly.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Command builders — pure functions, no side effects
// ---------------------------------------------------------------------------

export interface ProfileLinkInput {
  runtime: string;
  profileId: string;
  model: string;
  label?: string;
  purpose?: string;
  setDefault?: boolean;
}

/**
 * Constructs a `pa runtime link` command from validated create-profile inputs.
 * Returns the full shell command string ready to stage in a terminal.
 */
export function buildProfileLinkCommand(input: ProfileLinkInput): string {
  let cmd = `pa runtime link ${input.runtime} --profile ${input.profileId} --model ${input.model}`;
  if (input.label) {
    cmd += ` --label ${JSON.stringify(input.label)}`;
  }
  if (input.purpose) {
    cmd += ` --purpose ${JSON.stringify(input.purpose)}`;
  }
  if (input.setDefault) {
    cmd += ` --default`;
  }
  return cmd;
}

export interface ProfileUpdateModelInput {
  profileId: string;
  model: string;
}

/**
 * Constructs a `pa runtime update --model` command for a specific profile.
 */
export function buildProfileUpdateModelCommand(input: ProfileUpdateModelInput): string {
  return `pa runtime update ${input.profileId} --model ${input.model}`;
}

export interface ProfileUnlinkInput {
  profileId: string;
}

/**
 * Constructs a `pa runtime unlink` command for a specific profile.
 */
export function buildProfileUnlinkCommand(input: ProfileUnlinkInput): string {
  return `pa runtime unlink ${input.profileId}`;
}

// ---------------------------------------------------------------------------
// Flow result type
// ---------------------------------------------------------------------------

export type ProfileMutationFlowResult = "staged" | "cancelled" | "failed";

// ---------------------------------------------------------------------------
// Injectable window API surface
//
// Mirrors the minimal subset of `vscode.window` used by flows so that tests
// can supply plain-object mocks without a full vscode stub.
// ---------------------------------------------------------------------------

export interface ProfileMutationWindowApi {
  showInputBox(options: {
    prompt: string;
    value?: string;
    validateInput?: (value: string) => string | null | undefined;
  }): Thenable<string | undefined>;
  showWarningMessage(
    message: string,
    options: { modal?: boolean },
    ...items: string[]
  ): Thenable<string | undefined>;
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
}

// ---------------------------------------------------------------------------
// Create-profile flow
// ---------------------------------------------------------------------------

/**
 * Interactive create-profile flow. Prompts sequentially for runtime id,
 * profile id, and model via `showInputBox`. Constructs and stages a
 * `pa runtime link` command. Returns "cancelled" if the user dismisses
 * any prompt.
 */
export async function runCreateProfileFlow(input: {
  windowApi: ProfileMutationWindowApi;
  stageCommand: (cmd: string) => void;
  prefillRuntime?: string;
  prefillModel?: string;
}): Promise<ProfileMutationFlowResult> {
  const runtime = await input.windowApi.showInputBox({
    prompt: "Runtime identifier (e.g. codex-cli, claude-code, openai)",
    value: input.prefillRuntime ?? "",
    validateInput: (v) => (v.trim().length === 0 ? "Runtime identifier is required." : null),
  });
  if (!runtime) {
    return "cancelled";
  }

  const profileId = await input.windowApi.showInputBox({
    prompt: "Profile ID — a unique name for this profile",
    validateInput: (v) =>
      v.trim().length === 0
        ? "Profile ID is required."
        : !/^[\w-]+$/.test(v.trim())
          ? "Profile ID may only contain letters, numbers, hyphens, and underscores."
          : null,
  });
  if (!profileId) {
    return "cancelled";
  }

  const model = await input.windowApi.showInputBox({
    prompt: "Model name (e.g. gpt-4o, claude-3-5-sonnet, codex-1)",
    value: input.prefillModel ?? "",
    validateInput: (v) => (v.trim().length === 0 ? "Model name is required." : null),
  });
  if (!model) {
    return "cancelled";
  }

  const command = buildProfileLinkCommand({
    runtime: runtime.trim(),
    profileId: profileId.trim(),
    model: model.trim(),
  });
  input.stageCommand(command);
  return "staged";
}

// ---------------------------------------------------------------------------
// Update-model flow
// ---------------------------------------------------------------------------

/**
 * Prompts the user for a new model name for a specific existing profile and
 * stages a `pa runtime update --model` command. Returns "cancelled" if the
 * user dismisses the prompt.
 */
export async function runUpdateProfileModelFlow(input: {
  profileId: string;
  currentModel?: string | null;
  windowApi: ProfileMutationWindowApi;
  stageCommand: (cmd: string) => void;
}): Promise<ProfileMutationFlowResult> {
  const model = await input.windowApi.showInputBox({
    prompt: `New model name for profile "${input.profileId}"`,
    value: input.currentModel ?? "",
    validateInput: (v) => (v.trim().length === 0 ? "Model name is required." : null),
  });
  if (!model) {
    return "cancelled";
  }

  const command = buildProfileUpdateModelCommand({
    profileId: input.profileId,
    model: model.trim(),
  });
  input.stageCommand(command);
  return "staged";
}

// ---------------------------------------------------------------------------
// Unlink flow
// ---------------------------------------------------------------------------

/**
 * Shows a modal confirmation dialog before staging a `pa runtime unlink`
 * command. The confirmation text is explicit about the scope of the
 * operation (project configuration) so users understand what changes.
 * Returns "cancelled" if the user dismisses or declines the dialog.
 */
export async function runUnlinkProfileFlow(input: {
  profileId: string;
  windowApi: ProfileMutationWindowApi;
  stageCommand: (cmd: string) => void;
}): Promise<ProfileMutationFlowResult> {
  const choice = await input.windowApi.showWarningMessage(
    `Unlink profile "${input.profileId}"? This removes the profile from project configuration. The runtime itself is not affected.`,
    { modal: true },
    "Unlink Profile",
  );
  if (choice !== "Unlink Profile") {
    return "cancelled";
  }

  const command = buildProfileUnlinkCommand({ profileId: input.profileId });
  input.stageCommand(command);
  return "staged";
}
