import { useMemo, useState } from "preact/hooks";
import { ActionRow, CodeText, EmptyState, Surface, SurfaceSection } from "../../preact";
import type { ExperimentalArtifactBrowserBootstrap, WebviewToHostMessage } from "./types";

type CommandsShellData = NonNullable<ExperimentalArtifactBrowserBootstrap["shellData"]>["commands"];

interface CommandsShellSurfaceProps {
  readonly model?: CommandsShellData;
  readonly postMessage: (message: WebviewToHostMessage) => void;
}

function primaryGroup(command: string): string {
  const parts = command.trim().split(/\s+/).filter((token) => token.length > 0);
  if (parts.length < 2) {
    return "misc";
  }

  return parts[0] === "pa" ? (parts[1] ?? "misc") : (parts[0] ?? "misc");
}

export function CommandsShellSurface(props: CommandsShellSurfaceProps) {
  const [activeGroups, setActiveGroups] = useState<string[] | undefined>(undefined);

  if (!props.model) {
    return (
      <Surface>
        <SurfaceSection title="Commands">
          <EmptyState>
            Command catalog data is unavailable in this shell snapshot. Refresh to reload shell
            command content.
          </EmptyState>
        </SurfaceSection>
      </Surface>
    );
  }

  const entries = props.model.groups.flatMap((group) =>
    group.entries.map((entry) => ({
      ...entry,
      scope: group.kind,
      group: primaryGroup(entry.command),
    })),
  );

  const groups = useMemo(
    () => [...new Set(entries.map((entry) => entry.group))].sort((left, right) => left.localeCompare(right)),
    [entries],
  );

  const effectiveGroups = activeGroups && activeGroups.length > 0 ? activeGroups : groups;
  const visibleEntries = entries.filter((entry) => effectiveGroups.includes(entry.group));

  return (
    <Surface>
      <SurfaceSection title="Command Catalog">
        <p>
          Generated at <CodeText>{props.model.generatedAt}</CodeText> · source <CodeText>{props.model.source}</CodeText>
        </p>
        <ActionRow>
          <button type="button" onClick={() => props.postMessage({ type: "refreshCommandCatalogShellData" })}>
            Refresh Commands
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveGroups(groups);
            }}
          >
            Show All Groups
          </button>
        </ActionRow>
      </SurfaceSection>

      <SurfaceSection title="Group Filters">
        {groups.length > 0 ? (
          <ActionRow>
            {groups.map((group) => {
              const selected = effectiveGroups.includes(group);
              return (
                <button
                  type="button"
                  key={`filter-${group}`}
                  onClick={() => {
                    const base = activeGroups && activeGroups.length > 0 ? activeGroups : groups;
                    if (selected) {
                      const next = base.filter((value) => value !== group);
                      setActiveGroups(next.length > 0 ? next : [group]);
                      return;
                    }

                    setActiveGroups([...new Set([...base, group])].sort((left, right) => left.localeCompare(right)));
                  }}
                >
                  {selected ? "Hide" : "Show"} {group}
                </button>
              );
            })}
          </ActionRow>
        ) : (
          <EmptyState>No command groups available.</EmptyState>
        )}
      </SurfaceSection>

      <SurfaceSection title="Commands">
        {visibleEntries.length > 0 ? (
          <ul>
            {visibleEntries.map((entry) => (
              <li key={`${entry.scope}-${entry.command}`}>
                <p>
                  <CodeText>{entry.command}</CodeText> · {entry.scope === "extension" ? "extension" : "cli"} · {entry.section}
                </p>
                <p>{entry.description}</p>
                {entry.details.length > 0 ? (
                  <ul>
                    {entry.details.map((detail) => (
                      <li key={`${entry.command}-${detail.label}-${detail.description}`}>
                        <CodeText>{detail.label}</CodeText> — {detail.description}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ActionRow>
                  <button
                    type="button"
                    onClick={() =>
                      props.postMessage({
                        type: "commandCatalogStageCommand",
                        command: entry.command,
                        target: "existing",
                      })
                    }
                  >
                    Send to Existing Terminal
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      props.postMessage({
                        type: "commandCatalogStageCommand",
                        command: entry.command,
                        target: "new",
                      })
                    }
                  >
                    Send to New Terminal
                  </button>
                </ActionRow>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No commands visible for selected groups.</EmptyState>
        )}
      </SurfaceSection>
    </Surface>
  );
}
