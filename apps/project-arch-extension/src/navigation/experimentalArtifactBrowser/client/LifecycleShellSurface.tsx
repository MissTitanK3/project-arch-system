import { ActionRow, CodeText, EmptyState, Surface, SurfaceSection } from "../../preact";
import type { ExperimentalArtifactBrowserBootstrap, WebviewToHostMessage } from "./types";

type LifecycleShellData = NonNullable<ExperimentalArtifactBrowserBootstrap["shellData"]>["lifecycle"];

interface LifecycleShellSurfaceProps {
  readonly model?: LifecycleShellData;
  readonly postMessage: (message: WebviewToHostMessage) => void;
}

export function LifecycleShellSurface(props: LifecycleShellSurfaceProps) {
  if (!props.model) {
    return (
      <Surface>
        <SurfaceSection title="Lifecycle">
          <EmptyState>
            Lifecycle data is unavailable in this shell snapshot. Refresh to reload shell lifecycle
            content.
          </EmptyState>
        </SurfaceSection>
      </Surface>
    );
  }

  const status = props.model.status;

  return (
    <Surface>
      <SurfaceSection title="Lifecycle Status">
        <p>
          State: <CodeText>{status.state}</CodeText> · detected at <CodeText>{status.detectedAt}</CodeText>
        </p>
        <p>
          CLI: {status.cliAvailable ? "available" : "missing"} · initialized:{" "}
          {status.initialized ? "yes" : "no"}
        </p>
        <ActionRow>
          <button type="button" onClick={() => props.postMessage({ type: "refreshLifecycleShellData" })}>
            Refresh Lifecycle
          </button>
          <button
            type="button"
            onClick={() =>
              props.postMessage({
                type: "runCommand",
                command: "pa doctor health --json",
                execute: false,
              })
            }
          >
            Stage Health Check
          </button>
        </ActionRow>
      </SurfaceSection>

      <SurfaceSection title="Init Variants">
        {props.model.initVariants.length > 0 ? (
          <ul>
            {props.model.initVariants.map((variant) => (
              <li key={variant.id}>
                <p>
                  <CodeText>{variant.label}</CodeText> · {variant.description}
                </p>
                <p>
                  Command: <CodeText>{variant.command}</CodeText>
                </p>
                <ActionRow>
                  <button
                    type="button"
                    onClick={() =>
                      props.postMessage({
                        type: "runCommand",
                        command: variant.command,
                        execute: true,
                      })
                    }
                  >
                    Run Init
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      props.postMessage({
                        type: "runCommand",
                        command: variant.command,
                        execute: false,
                      })
                    }
                  >
                    Stage Init
                  </button>
                </ActionRow>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No lifecycle init variants available.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection title="Removal">
        <p>
          Use host-routed removal flow to remove <CodeText>project-arch</CodeText> scaffold directories.
        </p>
        <ActionRow>
          <button type="button" onClick={() => props.postMessage({ type: "lifecycleStageRemove" })}>
            Remove project-arch
          </button>
        </ActionRow>
      </SurfaceSection>
    </Surface>
  );
}
