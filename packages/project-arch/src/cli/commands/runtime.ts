import { Command } from "commander";
import { agent, runtime as runtimeSdk } from "../../sdk";
import { unwrap } from "../../sdk/_utils";
import type {
  RuntimeInventoryListResult,
  RuntimeProfileReadinessStatus,
  RuntimeReadinessCheckResult,
} from "../../schemas/runtimeInventoryReadiness";
import type {
  RuntimeDiscoveredCandidate,
  RuntimeScanResult,
} from "../../schemas/runtimeScanResult";
import type {
  RuntimeProfileAdapterOptions,
  RuntimeProfileCommonParameters,
  RuntimeProfilePreferredFor,
} from "../../schemas/runtimeProfileConfig";
import { formatEnhancedHelp } from "../help/format";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function renderProfileStatusEmoji(readiness: RuntimeProfileReadinessStatus): string {
  if (readiness === "ready") {
    return "✓";
  }

  if (readiness === "disabled") {
    return "○";
  }

  return "!";
}

function renderInventoryText(inventory: RuntimeInventoryListResult): void {
  console.log(`default-profile: ${inventory.defaultProfile ?? "(none)"}`);

  const availableRuntimes = inventory.runtimes.filter((entry) => entry.available);
  const unavailableRuntimes = inventory.runtimes.filter((entry) => !entry.available);

  console.log("available-runtimes:");
  if (availableRuntimes.length === 0) {
    console.log("- (none)");
  } else {
    for (const runtime of availableRuntimes) {
      console.log(
        `- ${runtime.runtime} (${runtime.displayName}) profiles=${runtime.profiles.length}`,
      );
    }
  }

  console.log("linked-unavailable-runtimes:");
  const linkedUnavailable = unavailableRuntimes.filter((entry) => entry.profiles.length > 0);
  if (linkedUnavailable.length === 0) {
    console.log("- (none)");
  } else {
    for (const runtime of linkedUnavailable) {
      console.log(`- ${runtime.runtime} profiles=${runtime.profiles.join(", ")}`);
    }
  }

  console.log("profiles:");
  if (inventory.profiles.length === 0) {
    console.log("- (none)");
    return;
  }

  for (const profile of inventory.profiles) {
    const flags = [profile.default ? "default" : null, !profile.enabled ? "disabled" : null]
      .filter((entry): entry is string => !!entry)
      .join(",");
    const flagsSuffix = flags ? ` [${flags}]` : "";
    console.log(
      `- ${renderProfileStatusEmoji(profile.readiness)} ${profile.id} -> ${profile.runtime} (${profile.readiness})${flagsSuffix}`,
    );
    if (profile.model) {
      console.log(`  model: ${profile.model}`);
    }
    for (const diagnostic of profile.diagnostics) {
      console.log(
        `  diagnostic: [${diagnostic.severity}] ${diagnostic.code} ${diagnostic.message}`,
      );
      console.log(`  next-step: ${diagnostic.nextStep}`);
    }
  }
}

function renderReadinessText(result: RuntimeReadinessCheckResult): void {
  console.log(`checked-at: ${result.checkedAt}`);
  if (result.profileId) {
    console.log(`profile: ${result.profileId}`);
  }

  if (result.profiles.length === 0) {
    console.log("profiles: (none)");
    return;
  }

  const ready = result.profiles.filter((entry) => entry.readiness === "ready");
  const notReady = result.profiles.filter(
    (entry) => entry.readiness !== "ready" && entry.readiness !== "disabled",
  );
  const disabled = result.profiles.filter((entry) => entry.readiness === "disabled");

  console.log(`ready: ${ready.length}`);
  console.log(`not-ready: ${notReady.length}`);
  console.log(`disabled: ${disabled.length}`);

  console.log("profiles:");
  for (const profile of result.profiles) {
    console.log(
      `- ${renderProfileStatusEmoji(profile.readiness)} ${profile.id} -> ${profile.runtime} (${profile.readiness})`,
    );
    for (const diagnostic of profile.diagnostics) {
      console.log(
        `  diagnostic: [${diagnostic.severity}] ${diagnostic.code} ${diagnostic.message}`,
      );
      console.log(`  next-step: ${diagnostic.nextStep}`);
    }
  }
}

function renderScanText(result: RuntimeScanResult): void {
  console.log(`scan-status: ${result.scanStatus}`);
  console.log(`scanned-at: ${result.scannedAt}`);
  console.log(`candidates: ${result.candidates.length}`);

  if (result.candidates.length === 0) {
    console.log("- (none)");
  } else {
    for (const candidate of result.candidates) {
      console.log(
        `- ${candidate.runtime} (${candidate.displayName}) confidence=${candidate.confidence} source=${candidate.source}`,
      );
      if (candidate.suggestedModel) {
        console.log(`  suggested-model: ${candidate.suggestedModel}`);
      }
      if (candidate.suggestedLabel) {
        console.log(`  suggested-label: ${candidate.suggestedLabel}`);
      }
      for (const diagnostic of candidate.diagnostics) {
        console.log(
          `  diagnostic: [${diagnostic.severity}] ${diagnostic.code} ${diagnostic.message}`,
        );
        console.log(`  next-step: ${diagnostic.nextStep}`);
      }
    }
  }

  console.log("scan-diagnostics:");
  if (result.diagnostics.length === 0) {
    console.log("- (none)");
    return;
  }

  for (const diagnostic of result.diagnostics) {
    console.log(`- [${diagnostic.severity}] ${diagnostic.code} ${diagnostic.message}`);
    console.log(`  next-step: ${diagnostic.nextStep}`);
  }
}

function resolveRegistrationModel(input: {
  model?: string;
  useSuggestedModel?: boolean;
  candidate: RuntimeDiscoveredCandidate;
}): string {
  if (input.model) {
    return input.model;
  }

  if (input.useSuggestedModel) {
    if (!input.candidate.suggestedModel) {
      throw new Error(
        `Candidate '${input.candidate.runtime}' does not provide a suggested model. Pass --model explicitly.`,
      );
    }

    return input.candidate.suggestedModel;
  }

  throw new Error(
    "Model selection is required. Pass --model <model> or explicitly confirm the suggested model with --use-suggested-model.",
  );
}

function resolveRegistrationCandidate(input: {
  requestedRuntime: string;
  candidates: RuntimeDiscoveredCandidate[];
}): RuntimeDiscoveredCandidate {
  const matches = input.candidates.filter(
    (candidate) => candidate.runtime === input.requestedRuntime,
  );

  if (matches.length === 0) {
    const available = input.candidates.map((candidate) => candidate.runtime);
    throw new Error(
      `Candidate '${input.requestedRuntime}' was not discovered by runtime scan. Discovered candidates: ${available.join(", ") || "(none)"}.`,
    );
  }

  if (matches.length > 1) {
    const options = matches
      .map(
        (candidate) =>
          `${candidate.displayName} (confidence=${candidate.confidence}, suggested-model=${candidate.suggestedModel ?? "none"})`,
      )
      .join("; ");
    throw new Error(
      `Runtime '${input.requestedRuntime}' has multiple discovered candidates: ${options}. Re-run 'pa runtime scan --json' and register explicitly with 'pa runtime link' to avoid ambiguity.`,
    );
  }

  return matches[0] as RuntimeDiscoveredCandidate;
}

function handleRuntimeCommandError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function parseKeyValueOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseRuntimeMutationValue(value: string): string | number | boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  if (normalized === "null") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value.trim() !== "") {
    return numeric;
  }

  return value;
}

function parsePairs(entries: string[]): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};

  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error(`Expected key=value pair, received '${entry}'.`);
    }

    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (!key) {
      throw new Error(`Expected key=value pair, received '${entry}'.`);
    }

    result[key] = parseRuntimeMutationValue(value);
  }

  return result;
}

function toRuntimeParameters(entries: string[]): RuntimeProfileCommonParameters | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const parsed = parsePairs(entries);
  const allowed = new Set(["reasoningEffort", "temperature", "maxOutputTokens"]);
  const unknown = Object.keys(parsed).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Unsupported --param keys: ${unknown.join(", ")}. Allowed keys: reasoningEffort, temperature, maxOutputTokens.`,
    );
  }

  return parsed as RuntimeProfileCommonParameters;
}

function toAdapterOptions(entries: string[]): RuntimeProfileAdapterOptions | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  return parsePairs(entries) as RuntimeProfileAdapterOptions;
}

function toPreferredFor(entries: string[]): RuntimeProfilePreferredFor[] | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const allowed = new Set<RuntimeProfilePreferredFor>(["run", "orchestrate", "review"]);
  const invalid = entries.filter((entry) => !allowed.has(entry as RuntimeProfilePreferredFor));
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported --preferred-for values: ${invalid.join(", ")}. Allowed values: run, orchestrate, review.`,
    );
  }

  return entries as RuntimeProfilePreferredFor[];
}

function printMutationJsonResult<T>(operation: {
  success: boolean;
  data?: T;
  errors?: string[];
}): void {
  if (operation.success) {
    printJson(operation.data);
    return;
  }

  printJson(operation);
  process.exitCode = 1;
}

function printMutationTextResult(input: {
  action: string;
  profileId?: string;
  config: { defaultProfile?: string; profiles: Array<{ id: string }> };
}): void {
  const suffix = input.profileId ? ` '${input.profileId}'` : "";
  console.log(`${input.action}${suffix}.`);
  console.log(`default-profile: ${input.config.defaultProfile ?? "(none)"}`);
  console.log(
    `profiles: ${input.config.profiles.map((profile) => profile.id).join(", ") || "(none)"}`,
  );
}

export function registerRuntimeCommand(program: Command): void {
  const command = program
    .command("runtime")
    .description("Inspect runtime inventory and readiness before launch")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage:
          "pa runtime <list|check|scan|register|link|update|enable|disable|default|unlink> [options]",
        description:
          "Runtime list/check expose inventory and readiness. Runtime mutation commands manage bounded profile config writes without manual file editing.",
        examples: [
          { description: "List merged runtime inventory", command: "pa runtime list" },
          { description: "Scan runtime candidates", command: "pa runtime scan" },
          { description: "Check readiness for all linked profiles", command: "pa runtime check" },
          {
            description: "Register profile from scan candidate",
            command:
              "pa runtime register --candidate ollama --profile ollama-local --model llama3.2 --yes",
          },
          {
            description: "Link a runtime profile",
            command: "pa runtime link codex-cli --profile codex-implementer --model gpt-5.4",
          },
          {
            description: "Check one profile and emit machine-readable output",
            command: "pa runtime check codex-implementer --json",
          },
        ],
        relatedCommands: [
          { command: "pa agent run <taskRef> --runtime <runtime>", description: "Launch a run" },
          { command: "pa help commands", description: "Inspect command catalogue" },
        ],
      }),
    );

  command
    .command("list")
    .description("List merged runtime inventory (available runtimes + linked profiles)")
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa runtime list [--json]",
        description:
          "Returns the merged runtime inventory model. Use this to inspect available adapters and linked profiles in one view.",
        examples: [
          { description: "List inventory", command: "pa runtime list" },
          { description: "Emit inventory contract", command: "pa runtime list --json" },
        ],
      }),
    )
    .action(async (options: { json?: boolean }) => {
      try {
        const operation = await runtimeSdk.runtimeList({
          adapterRegistry: agent.createBootstrappedAgentRuntimeAdapterRegistry(),
        });

        if (options.json) {
          if (operation.success) {
            printJson(operation.data);
          } else {
            printJson(operation);
            process.exitCode = 1;
          }
          return;
        }

        const result = unwrap(operation);
        renderInventoryText(result);
      } catch (error) {
        handleRuntimeCommandError(error);
      }
    });

  command
    .command("scan")
    .description("Scan adapter-backed runtime candidates for this environment")
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa runtime scan [--json]",
        description:
          "Runs adapter probe discovery and returns runtime candidates with confidence and diagnostics.",
        examples: [
          { description: "Scan runtime candidates", command: "pa runtime scan" },
          { description: "Emit scan contract", command: "pa runtime scan --json" },
        ],
      }),
    )
    .action(async (options: { json?: boolean }) => {
      try {
        const operation = await runtimeSdk.runtimeScan({
          adapterRegistry: agent.createBootstrappedAgentRuntimeAdapterRegistry(),
        });

        if (options.json) {
          if (operation.success) {
            printJson(operation.data);
          } else {
            printJson(operation);
            process.exitCode = 1;
          }
          return;
        }

        const result = unwrap(operation);
        renderScanText(result);
      } catch (error) {
        handleRuntimeCommandError(error);
      }
    });

  command
    .command("register")
    .description("Register a runtime profile from scan candidates")
    .requiredOption("--candidate <runtime>", "Candidate runtime id from runtime scan")
    .requiredOption("--profile <id>", "Runtime profile id to create")
    .option("--model <model>", "Explicit model id to link")
    .option(
      "--use-suggested-model",
      "Confirm using adapter-suggested model when available (explicit confirmation required)",
    )
    .option("--label <label>", "Optional display label")
    .option("--purpose <text>", "Optional purpose text")
    .option("--default", "Set as default profile")
    .option("--yes", "Confirm profile write")
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage:
          "pa runtime register --candidate <runtime> --profile <id> [--model <model>|--use-suggested-model] [--default] --yes [--json]",
        description:
          "Scan-to-register flow that requires explicit model selection (or explicit suggested-model confirmation) and write confirmation.",
        examples: [
          {
            description: "Register with explicit model",
            command:
              "pa runtime register --candidate codex-cli --profile codex-implementer --model gpt-5.4 --yes",
          },
          {
            description: "Register using suggested model with explicit confirmation",
            command:
              "pa runtime register --candidate ollama --profile ollama-local --use-suggested-model --yes",
          },
        ],
      }),
    )
    .action(
      async (options: {
        candidate: string;
        profile: string;
        model?: string;
        useSuggestedModel?: boolean;
        label?: string;
        purpose?: string;
        default?: boolean;
        yes?: boolean;
        json?: boolean;
      }) => {
        try {
          if (!options.yes) {
            throw new Error("Confirmation required for runtime registration. Re-run with --yes.");
          }

          const adapterRegistry = agent.createBootstrappedAgentRuntimeAdapterRegistry();
          const scanOperation = await runtimeSdk.runtimeScan({ adapterRegistry });
          const scan = unwrap(scanOperation);

          const selectedCandidate = resolveRegistrationCandidate({
            requestedRuntime: options.candidate,
            candidates: scan.candidates,
          });
          const model = resolveRegistrationModel({
            model: options.model,
            useSuggestedModel: options.useSuggestedModel,
            candidate: selectedCandidate,
          });

          const configOperation = await runtimeSdk.runtimeConfigRead();
          const config = unwrap(configOperation);
          if (config) {
            if (config.profiles.some((profile) => profile.id === options.profile)) {
              throw new Error(
                `Runtime profile '${options.profile}' already exists. Choose a unique --profile id or use 'pa runtime update'.`,
              );
            }

            const existing = config.profiles.find(
              (profile) => profile.runtime === selectedCandidate.runtime && profile.model === model,
            );
            if (existing) {
              throw new Error(
                `Runtime/model conflict: profile '${existing.id}' already links runtime '${selectedCandidate.runtime}' with model '${model}'.`,
              );
            }
          }

          const operation = await runtimeSdk.runtimeLink({
            id: options.profile,
            runtime: selectedCandidate.runtime,
            model,
            label: options.label ?? selectedCandidate.suggestedLabel,
            purpose: options.purpose,
            setDefault: options.default,
            adapterRegistry,
          });

          if (options.json) {
            if (operation.success) {
              printJson({
                status: "runtime-register",
                candidate: selectedCandidate,
                profileId: options.profile,
                model,
                config: operation.data,
              });
            } else {
              printJson(operation);
              process.exitCode = 1;
            }
            return;
          }

          const persisted = unwrap(operation);
          console.log(
            `Registered runtime profile '${options.profile}' from candidate '${selectedCandidate.runtime}' using model '${model}'.`,
          );
          console.log(`default-profile: ${persisted.defaultProfile ?? "(none)"}`);
          console.log(
            `profiles: ${persisted.profiles.map((profile) => profile.id).join(", ") || "(none)"}`,
          );
        } catch (error) {
          handleRuntimeCommandError(error);
        }
      },
    );

  command
    .command("check")
    .description("Check runtime profile readiness for all or one linked profile")
    .argument("[profileId]", "Optional runtime profile id")
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa runtime check [profileId] [--json]",
        description:
          "Evaluates readiness diagnostics for linked profiles. Provide profileId to scope to one profile.",
        examples: [
          { description: "Check all profiles", command: "pa runtime check" },
          {
            description: "Check one profile",
            command: "pa runtime check codex-implementer",
          },
          {
            description: "Emit readiness contract",
            command: "pa runtime check --json",
          },
        ],
      }),
    )
    .action(async (profileId: string | undefined, options: { json?: boolean }) => {
      try {
        const operation = await runtimeSdk.runtimeCheck({
          adapterRegistry: agent.createBootstrappedAgentRuntimeAdapterRegistry(),
          profileId,
        });

        if (options.json) {
          if (operation.success) {
            printJson(operation.data);
          } else {
            printJson(operation);
            process.exitCode = 1;
          }
          return;
        }

        const result = unwrap(operation);
        renderReadinessText(result);
      } catch (error) {
        handleRuntimeCommandError(error);
      }
    });

  command
    .command("link")
    .description("Link a runtime profile in project config")
    .argument("<runtime>", "Runtime adapter id")
    .requiredOption("--profile <id>", "Runtime profile id")
    .requiredOption("--model <model>", "Model id")
    .option("--label <label>", "Optional display label")
    .option("--purpose <text>", "Optional purpose text")
    .option(
      "--preferred-for <intent>",
      "Preferred intent (run|orchestrate|review), repeatable",
      parseKeyValueOption,
      [],
    )
    .option("--param <key=value>", "Common parameter, repeatable", parseKeyValueOption, [])
    .option("--option <key=value>", "Adapter option, repeatable", parseKeyValueOption, [])
    .option("--default", "Set as default profile")
    .option("--json", "Output machine-readable JSON")
    .action(
      async (
        runtime: string,
        options: {
          profile: string;
          model: string;
          label?: string;
          purpose?: string;
          preferredFor?: string[];
          param?: string[];
          option?: string[];
          default?: boolean;
          json?: boolean;
        },
      ) => {
        try {
          const operation = await runtimeSdk.runtimeLink({
            runtime,
            id: options.profile,
            model: options.model,
            label: options.label,
            purpose: options.purpose,
            preferredFor: toPreferredFor(options.preferredFor ?? []),
            parameters: toRuntimeParameters(options.param ?? []),
            adapterOptions: toAdapterOptions(options.option ?? []),
            setDefault: options.default,
            adapterRegistry: agent.createBootstrappedAgentRuntimeAdapterRegistry(),
          });

          if (options.json) {
            printMutationJsonResult(operation);
            return;
          }

          const config = unwrap(operation);
          printMutationTextResult({
            action: "Linked runtime profile",
            profileId: options.profile,
            config,
          });
        } catch (error) {
          handleRuntimeCommandError(error);
        }
      },
    );

  command
    .command("update")
    .description("Update bounded runtime profile fields")
    .argument("<profileId>", "Runtime profile id")
    .option("--model <model>", "Update model")
    .option("--label <label>", "Update label")
    .option("--clear-label", "Clear label")
    .option("--purpose <text>", "Update purpose")
    .option("--clear-purpose", "Clear purpose")
    .option(
      "--preferred-for <intent>",
      "Preferred intent (run|orchestrate|review), repeatable",
      parseKeyValueOption,
      [],
    )
    .option("--clear-preferred-for", "Clear preferredFor")
    .option("--param <key=value>", "Common parameter, repeatable", parseKeyValueOption, [])
    .option("--clear-params", "Clear common parameters")
    .option("--option <key=value>", "Adapter option, repeatable", parseKeyValueOption, [])
    .option("--clear-options", "Clear adapter options")
    .option("--enable", "Enable profile")
    .option("--disable", "Disable profile")
    .option("--default", "Set as default profile")
    .option("--clear-default", "Clear default profile if this profile is default")
    .option("--json", "Output machine-readable JSON")
    .action(
      async (
        profileId: string,
        options: {
          model?: string;
          label?: string;
          clearLabel?: boolean;
          purpose?: string;
          clearPurpose?: boolean;
          preferredFor?: string[];
          clearPreferredFor?: boolean;
          param?: string[];
          clearParams?: boolean;
          option?: string[];
          clearOptions?: boolean;
          enable?: boolean;
          disable?: boolean;
          default?: boolean;
          clearDefault?: boolean;
          json?: boolean;
        },
      ) => {
        try {
          if (options.enable && options.disable) {
            throw new Error("Cannot pass both --enable and --disable.");
          }

          const operation = await runtimeSdk.runtimeUpdate({
            profileId,
            model: options.model,
            label: options.clearLabel ? null : options.label,
            purpose: options.clearPurpose ? null : options.purpose,
            preferredFor: options.clearPreferredFor
              ? null
              : toPreferredFor(options.preferredFor ?? []),
            parameters: options.clearParams ? null : toRuntimeParameters(options.param ?? []),
            adapterOptions: options.clearOptions ? null : toAdapterOptions(options.option ?? []),
            enabled: options.enable ? true : options.disable ? false : undefined,
            setDefault: options.default,
            clearDefault: options.clearDefault,
            adapterRegistry: agent.createBootstrappedAgentRuntimeAdapterRegistry(),
          });

          if (options.json) {
            printMutationJsonResult(operation);
            return;
          }

          const config = unwrap(operation);
          printMutationTextResult({
            action: "Updated runtime profile",
            profileId,
            config,
          });
        } catch (error) {
          handleRuntimeCommandError(error);
        }
      },
    );

  command
    .command("enable")
    .description("Enable a linked runtime profile")
    .argument("<profileId>", "Runtime profile id")
    .option("--json", "Output machine-readable JSON")
    .action(async (profileId: string, options: { json?: boolean }) => {
      try {
        const operation = await runtimeSdk.runtimeEnable({
          profileId,
          adapterRegistry: agent.createBootstrappedAgentRuntimeAdapterRegistry(),
        });

        if (options.json) {
          printMutationJsonResult(operation);
          return;
        }

        const config = unwrap(operation);
        printMutationTextResult({
          action: "Enabled runtime profile",
          profileId,
          config,
        });
      } catch (error) {
        handleRuntimeCommandError(error);
      }
    });

  command
    .command("disable")
    .description("Disable a linked runtime profile")
    .argument("<profileId>", "Runtime profile id")
    .option("--json", "Output machine-readable JSON")
    .action(async (profileId: string, options: { json?: boolean }) => {
      try {
        const operation = await runtimeSdk.runtimeDisable({
          profileId,
          adapterRegistry: agent.createBootstrappedAgentRuntimeAdapterRegistry(),
        });

        if (options.json) {
          printMutationJsonResult(operation);
          return;
        }

        const config = unwrap(operation);
        printMutationTextResult({
          action: "Disabled runtime profile",
          profileId,
          config,
        });
      } catch (error) {
        handleRuntimeCommandError(error);
      }
    });

  command
    .command("default")
    .description("Set or clear default runtime profile")
    .argument("[profileId]", "Runtime profile id")
    .option("--clear", "Clear default profile")
    .option("--json", "Output machine-readable JSON")
    .action(async (profileId: string | undefined, options: { clear?: boolean; json?: boolean }) => {
      try {
        const operation = await runtimeSdk.runtimeDefault({
          profileId,
          clearDefault: options.clear,
        });

        if (options.json) {
          printMutationJsonResult(operation);
          return;
        }

        const config = unwrap(operation);
        printMutationTextResult({
          action: options.clear ? "Cleared default runtime profile" : "Set default runtime profile",
          profileId,
          config,
        });
      } catch (error) {
        handleRuntimeCommandError(error);
      }
    });

  command
    .command("unlink")
    .description("Remove a linked runtime profile")
    .argument("<profileId>", "Runtime profile id")
    .option("--json", "Output machine-readable JSON")
    .action(async (profileId: string, options: { json?: boolean }) => {
      try {
        const operation = await runtimeSdk.runtimeUnlink({ profileId });

        if (options.json) {
          printMutationJsonResult(operation);
          return;
        }

        const config = unwrap(operation);
        printMutationTextResult({
          action: "Unlinked runtime profile",
          profileId,
          config,
        });
      } catch (error) {
        handleRuntimeCommandError(error);
      }
    });
}
