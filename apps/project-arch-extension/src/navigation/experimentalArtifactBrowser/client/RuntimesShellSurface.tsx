import { ActionRow, CodeText, EmptyState, Surface, SurfaceSection } from "../../preact";
import type { ExperimentalArtifactBrowserBootstrap, WebviewToHostMessage } from "./types";

type RuntimesShellData = NonNullable<ExperimentalArtifactBrowserBootstrap["shellData"]>["runtimes"];

interface RuntimesShellSurfaceProps {
  readonly model?: RuntimesShellData;
  readonly postMessage: (message: WebviewToHostMessage) => void;
}

export function RuntimesShellSurface(props: RuntimesShellSurfaceProps) {
  if (!props.model) {
    return (
      <Surface>
        <SurfaceSection title="Runtimes">
          <EmptyState>
            Runtimes data is unavailable in this shell snapshot. Use panel refresh to reload
            shared-shell runtimes content.
          </EmptyState>
        </SurfaceSection>
      </Surface>
    );
  }

  if (props.model.loadState === "failed") {
    return (
      <Surface>
        <SurfaceSection title="Runtimes">
          <EmptyState>{props.model.error ?? "Failed to load runtime inventory."}</EmptyState>
        </SurfaceSection>
      </Surface>
    );
  }

  const runMutation = (input: {
    kind: string;
    profileId?: string;
    currentModel?: string;
    runtime?: string;
    suggestedModel?: string;
  }) => {
    props.postMessage({
      type: "runtimeProfileMutation",
      kind: input.kind,
      profileId: input.profileId,
      currentModel: input.currentModel,
      runtime: input.runtime,
      suggestedModel: input.suggestedModel,
    });
  };

  return (
    <Surface>
      <SurfaceSection title="Runtime Inventory">
        <p>
          Source authority: <CodeText>{props.model.sourceAuthority}</CodeText>
        </p>
        <p>
          Profiles: <strong>{props.model.summary.totalProfiles}</strong> · Ready{" "}
          <strong>{props.model.summary.readyProfiles}</strong> · Blocked{" "}
          <strong>{props.model.summary.blockedProfiles}</strong>
        </p>
        <ActionRow>
          <button
            type="button"
            onClick={() => props.postMessage({ type: "refreshRuntimesShellData" })}
          >
            Refresh Inventory
          </button>
          <button type="button" onClick={() => runMutation({ kind: "create" })}>
            Link Profile
          </button>
          <button
            type="button"
            onClick={() => props.postMessage({ type: "refreshRuntimesShellData" })}
          >
            Refresh Scan
          </button>
          <button
            type="button"
            onClick={() =>
              props.postMessage({
                type: "runCommand",
                command: "pa runtime list --json",
                execute: false,
              })
            }
          >
            Stage Inventory Command
          </button>
          <button
            type="button"
            onClick={() =>
              props.postMessage({
                type: "runCommand",
                command: "pa runtime scan --json",
                execute: false,
              })
            }
          >
            Stage Scan Command
          </button>
          <button
            type="button"
            onClick={() =>
              props.postMessage({
                type: "runCommand",
                command: "pa runtime check --json",
                execute: false,
              })
            }
          >
            Check All Readiness
          </button>
          <button
            type="button"
            onClick={() =>
              props.postMessage({
                type: "runCommand",
                command: "pa runtime help",
                execute: false,
              })
            }
          >
            Runtime Commands Help
          </button>
        </ActionRow>
      </SurfaceSection>

      <SurfaceSection title="Runtime Scan Candidates">
        {props.model.scanCandidates.length > 0 ? (
          <ul>
            {props.model.scanCandidates.map((candidate) => (
              <li key={`${candidate.runtime}-${candidate.source}`}>
                <p>
                  <CodeText>{candidate.displayName}</CodeText> · source {candidate.source} ·
                  confidence {candidate.confidence}
                </p>
                <p>{candidate.description ?? "No description."}</p>
                <ActionRow>
                  {!candidate.alreadyLinked ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          runMutation({
                            kind: "create-candidate",
                            runtime: candidate.runtime,
                            suggestedModel: candidate.suggestedModel,
                          })
                        }
                      >
                        Link Candidate Profile
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          props.postMessage({
                            type: "runCommand",
                            command: candidate.suggestedModel
                              ? `pa runtime register --candidate ${candidate.runtime} --profile <id> --use-suggested-model --yes`
                              : `pa runtime register --candidate ${candidate.runtime} --profile <id> --model <model> --yes`,
                            execute: false,
                          })
                        }
                      >
                        Register with Guided Flow
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      props.postMessage({
                        type: "runCommand",
                        command: candidate.registerCommand,
                        execute: false,
                      })
                    }
                  >
                    Stage Register Command
                  </button>
                </ActionRow>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No runtime scan candidates discovered yet.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection title="Profiles">
        {props.model.profiles.length > 0 ? (
          <ul>
            {props.model.profiles.map((profile) => (
              <li key={profile.id}>
                <p>
                  <CodeText>{profile.id}</CodeText> · runtime {profile.runtimeDisplayName} ·{" "}
                  {profile.readinessSummary}
                </p>
                <p>
                  Enabled: {profile.enabled ? "yes" : "no"} · Default:{" "}
                  {profile.isDefault ? "yes" : "no"}
                </p>
                {profile.diagnostics.length > 0 ? (
                  <ul>
                    {profile.diagnostics.map((diagnostic, index) => (
                      <li key={`${profile.id}-${diagnostic.severity}-${index}`}>
                        {diagnostic.severity}: {diagnostic.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ActionRow>
                  {profile.affordances.map((affordance) => {
                    if (affordance.kind === "unlink") {
                      return (
                        <button
                          type="button"
                          key={`${profile.id}-${affordance.kind}`}
                          onClick={() => runMutation({ kind: "unlink", profileId: profile.id })}
                        >
                          {affordance.label}
                        </button>
                      );
                    }

                    if (affordance.kind === "update") {
                      return (
                        <button
                          type="button"
                          key={`${profile.id}-${affordance.kind}`}
                          onClick={() =>
                            runMutation({
                              kind: "update-model",
                              profileId: profile.id,
                              currentModel: profile.model ?? undefined,
                            })
                          }
                        >
                          {affordance.label}
                        </button>
                      );
                    }

                    return (
                      <button
                        type="button"
                        key={`${profile.id}-${affordance.kind}`}
                        onClick={() =>
                          props.postMessage({
                            type: "runCommand",
                            command: affordance.command,
                            execute: false,
                          })
                        }
                      >
                        Stage {affordance.label}
                      </button>
                    );
                  })}
                </ActionRow>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No runtime profiles discovered yet.</EmptyState>
        )}
      </SurfaceSection>
    </Surface>
  );
}
