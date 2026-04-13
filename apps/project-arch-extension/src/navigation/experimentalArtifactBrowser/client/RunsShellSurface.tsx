import { ActionRow, CodeText, EmptyState, Surface, SurfaceSection } from "../../preact";
import type { ExperimentalArtifactBrowserBootstrap, WebviewToHostMessage } from "./types";

type RunsShellData = NonNullable<ExperimentalArtifactBrowserBootstrap["shellData"]>["runs"];

interface RunsShellSurfaceProps {
  readonly model?: RunsShellData;
  readonly postMessage: (message: WebviewToHostMessage) => void;
}

function toCommand(cliArgs: readonly string[]): string {
  return `pa ${cliArgs.join(" ")}`;
}

export function RunsShellSurface(props: RunsShellSurfaceProps) {
  if (!props.model) {
    return (
      <Surface>
        <SurfaceSection title="Runs">
          <EmptyState>
            Runs data is unavailable in this shell snapshot. Use panel refresh to reload
            shared-shell runs content.
          </EmptyState>
        </SurfaceSection>
      </Surface>
    );
  }

  const cards = props.model.cards;
  const runtimeProfiles = props.model.runtimeProfiles;

  return (
    <Surface>
      <SurfaceSection title="Runs Summary">
        <p>
          Generated at <CodeText>{props.model.generatedAt}</CodeText>
        </p>
        <p>
          <strong>{props.model.runCount}</strong> runs ·{" "}
          <strong>{props.model.needsAttentionCount}</strong> need attention ·{" "}
          <strong>{props.model.auditErrorCount}</strong> audit errors ·{" "}
          <strong>{props.model.orchestratedCount}</strong> orchestration-linked
        </p>
        <ActionRow>
          <button type="button" onClick={() => props.postMessage({ type: "refreshRunsShellData" })}>
            Refresh Runs
          </button>
          <button
            type="button"
            onClick={() =>
              props.postMessage({
                type: "runCommand",
                command: runtimeProfiles.refreshCommand,
                execute: false,
              })
            }
          >
            Stage Runtime Refresh
          </button>
        </ActionRow>
      </SurfaceSection>

      <SurfaceSection title="Runtime Profile Readiness">
        <p>
          Source: <CodeText>{runtimeProfiles.sourceAuthority}</CodeText> · ready{" "}
          <strong>{runtimeProfiles.readyCount}</strong> · blocked{" "}
          <strong>{runtimeProfiles.blockedCount}</strong>
        </p>
        <p>{runtimeProfiles.decisionReason}</p>
        <p>{runtimeProfiles.nextStep}</p>
        {runtimeProfiles.options.length > 0 ? (
          <ul>
            {runtimeProfiles.options.map((option) => (
              <li key={option.id}>
                <CodeText>{option.id}</CodeText> ({option.runtime}) · {option.inlineSummary}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No runtime profile options discovered for launch guidance.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection title="Recent Runs">
        {cards.length > 0 ? (
          <ul>
            {cards.map((card) => {
              const followUps = card.followUpActions.filter((action) => action.cliArgs.length > 0);

              return (
                <li key={card.runId}>
                  <p>
                    <CodeText>{card.runId}</CodeText> · {card.outcome} · {card.taskRef}
                  </p>
                  <p>
                    Runtime: <CodeText>{card.runtime ?? "unknown"}</CodeText> · launched{" "}
                    {card.launchedAt ?? "unknown"}
                  </p>
                  <p>{card.nextStep}</p>
                  {card.error ? <p>Error: {card.error}</p> : null}
                  <ActionRow>
                    {followUps.map((followUp) => (
                      <button
                        type="button"
                        key={`${card.runId}-${followUp.id}`}
                        onClick={() =>
                          props.postMessage({
                            type: "runCommand",
                            command: toCommand(followUp.cliArgs),
                            execute: false,
                          })
                        }
                      >
                        Stage {followUp.label}
                      </button>
                    ))}
                  </ActionRow>
                  {card.artifacts.length > 0 ? (
                    <ActionRow>
                      {card.artifacts.map((artifact) => (
                        <button
                          type="button"
                          key={`${card.runId}-${artifact.kind}-${artifact.relativePath}`}
                          onClick={() =>
                            props.postMessage({
                              type: "openArtifactInspector",
                              kind: artifact.kind,
                              relativePath: artifact.relativePath,
                              label: artifact.label,
                            })
                          }
                        >
                          Open {artifact.label}
                        </button>
                      ))}
                    </ActionRow>
                  ) : null}
                  {card.orchestrationSummary ? <p>{card.orchestrationSummary}</p> : null}
                  <p>{card.auditSummary}</p>
                  <p>
                    {card.hasAuditErrors ? "Audit errors detected." : "No audit errors detected."}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>No run records discovered yet.</EmptyState>
        )}
      </SurfaceSection>
    </Surface>
  );
}
