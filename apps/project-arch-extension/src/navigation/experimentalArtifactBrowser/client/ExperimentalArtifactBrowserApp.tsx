import { useEffect, useMemo, useState } from "preact/hooks";
import { useShellSurfaceSelectionState } from "../../preact";
import type { ShellNavigationGuidanceState } from "../../preact";
import { isHostToWebviewMessage } from "../../artifactBrowserMessageContracts";
import { ArtifactBrowserSurface } from "./ArtifactBrowserSurface";
import { ExperimentalArtifactBrowserShell } from "./ExperimentalArtifactBrowserShell";
import { RunsShellSurface } from "./RunsShellSurface";
import { RuntimesShellSurface } from "./RuntimesShellSurface";
import { LifecycleShellSurface } from "./LifecycleShellSurface";
import { CommandsShellSurface } from "./CommandsShellSurface";
import {
  createInitialViewState,
  type ExperimentalArtifactBrowserViewState,
} from "./experimentalArtifactBrowserNavigationState";
import {
  artifactBrowserShellNavigationItems,
  createArtifactBrowserShellSurfaceSlots,
  createArtifactBrowserSurfaceGuidancePayload,
} from "./artifactBrowserShellConfig";
import type {
  ArtifactBrowserModel,
  ExperimentalArtifactBrowserBootstrap,
  ExperimentalStageChatSessionState,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "./types";

interface ExperimentalArtifactBrowserAppProps {
  model: ArtifactBrowserModel;
  shellData?: ExperimentalArtifactBrowserBootstrap["shellData"];
  stageChat?: ExperimentalArtifactBrowserBootstrap["stageChat"];
  postMessage: (message: WebviewToHostMessage) => void;
  initialViewState?: Partial<ExperimentalArtifactBrowserViewState>;
  initialActiveSurfaceId?: string;
  initialGuidanceRailOpen?: boolean;
  onViewStateChange?: (viewState: ExperimentalArtifactBrowserViewState) => void;
  onActiveSurfaceIdChange?: (activeSurfaceId: string | undefined) => void;
  onGuidanceRailOpenChange?: (isGuidanceRailOpen: boolean) => void;
}

function toStageChatSessionKey(relativePath: string, stageId: string): string {
  return `${relativePath}::${stageId}`;
}

function toHydratedStageChatSessionsByKey(
  stageChat: ExperimentalArtifactBrowserBootstrap["stageChat"] | undefined,
): Record<string, ExperimentalStageChatSessionState> {
  if (!stageChat) {
    return {};
  }

  return Object.fromEntries(
    stageChat.sessions.map((session) => [
      toStageChatSessionKey(session.relativePath, session.stageId),
      {
        relativePath: session.relativePath,
        stageId: session.stageId,
        stageTitle: session.stageTitle,
        runtimeState: "idle",
        statusMessage: "",
        lastFailedMessage: "",
        threadKey: session.threadKey,
        runtimeClass: session.runtimeClass,
        sessionStatus: session.sessionStatus,
        availableActions: session.availableActions,
        turns: session.turns,
      } satisfies ExperimentalStageChatSessionState,
    ]),
  );
}

function mergeHydratedStageChatSessions(input: {
  previous: Record<string, ExperimentalStageChatSessionState>;
  stageChat: ExperimentalArtifactBrowserBootstrap["stageChat"] | undefined;
}): Record<string, ExperimentalStageChatSessionState> {
  const hydrated = toHydratedStageChatSessionsByKey(input.stageChat);
  if (Object.keys(hydrated).length === 0) {
    return input.previous;
  }

  const next = { ...input.previous };
  for (const [key, session] of Object.entries(hydrated)) {
    const existing = input.previous[key];
    next[key] = {
      ...session,
      runtimeState: existing?.runtimeState ?? session.runtimeState,
      statusMessage: existing?.statusMessage ?? session.statusMessage,
      lastFailedMessage: existing?.lastFailedMessage ?? session.lastFailedMessage,
      turns: existing && existing.turns.length > 0 ? existing.turns : session.turns,
    };
  }

  return next;
}

function applyStageChatRuntimeStateMessage(
  previous: Record<string, ExperimentalStageChatSessionState>,
  message: Extract<HostToWebviewMessage, { type: "stageChatRuntimeState" }>,
): Record<string, ExperimentalStageChatSessionState> {
  const key = toStageChatSessionKey(message.relativePath, message.stageId);
  const existing = previous[key];

  return {
    ...previous,
    [key]: {
      relativePath: message.relativePath,
      stageId: message.stageId,
      stageTitle: message.stageTitle,
      runtimeState: message.runtimeState,
      statusMessage: message.statusMessage,
      lastFailedMessage: message.canRetry ? message.failedMessage : "",
      threadKey: message.threadKey ?? existing?.threadKey,
      runtimeClass: message.runtimeClass ?? existing?.runtimeClass,
      sessionStatus: message.sessionStatus ?? existing?.sessionStatus,
      availableActions: message.availableActions ?? existing?.availableActions,
      turns: message.clearTurns ? [] : (existing?.turns ?? []),
    },
  };
}

function applyStageChatRuntimeResponseMessage(
  previous: Record<string, ExperimentalStageChatSessionState>,
  message: Extract<HostToWebviewMessage, { type: "stageChatRuntimeResponse" }>,
): Record<string, ExperimentalStageChatSessionState> {
  const key = toStageChatSessionKey(message.relativePath, message.stageId);
  const existing = previous[key];
  const existingTurns = existing?.turns ?? [];

  const turns = (() => {
    if (!message.append) {
      return [...existingTurns, { role: message.role, content: message.content }];
    }

    const lastTurn = existingTurns[existingTurns.length - 1];
    if (lastTurn && lastTurn.role === message.role) {
      return [
        ...existingTurns.slice(0, -1),
        {
          ...lastTurn,
          content: `${typeof lastTurn.content === "string" ? lastTurn.content : ""}${message.content}`,
        },
      ];
    }

    return [...existingTurns, { role: message.role, content: message.content }];
  })();

  return {
    ...previous,
    [key]: {
      relativePath: message.relativePath,
      stageId: message.stageId,
      stageTitle: message.stageTitle,
      runtimeState: message.append ? "sending" : "success",
      statusMessage: message.append
        ? "Receiving response from selected runtime..."
        : "Response received.",
      lastFailedMessage: "",
      threadKey: existing?.threadKey,
      runtimeClass: existing?.runtimeClass,
      sessionStatus: existing?.sessionStatus ?? "active",
      availableActions: existing?.availableActions ?? ["resume", "reset", "discard"],
      turns,
    },
  };
}

export function ExperimentalArtifactBrowserApp(props: ExperimentalArtifactBrowserAppProps) {
  const [viewState, setViewState] = useState<ExperimentalArtifactBrowserViewState>(() =>
    createInitialViewState(props.model, props.initialViewState),
  );
  const [stageChatSessionsByKey, setStageChatSessionsByKey] = useState<
    Record<string, ExperimentalStageChatSessionState>
  >(() => toHydratedStageChatSessionsByKey(props.stageChat));

  useEffect(() => {
    setViewState((previous) => createInitialViewState(props.model, previous));
  }, [props.model]);

  useEffect(() => {
    props.onViewStateChange?.(viewState);
  }, [props.onViewStateChange, viewState]);

  useEffect(() => {
    setStageChatSessionsByKey((previous) =>
      mergeHydratedStageChatSessions({
        previous,
        stageChat: props.stageChat,
      }),
    );
  }, [props.stageChat]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (!isHostToWebviewMessage(payload)) {
        return;
      }

      if (payload.type === "stageChatRuntimeState") {
        setStageChatSessionsByKey((previous) =>
          applyStageChatRuntimeStateMessage(previous, payload),
        );
        return;
      }

      if (payload.type === "stageChatRuntimeResponse") {
        setStageChatSessionsByKey((previous) =>
          applyStageChatRuntimeResponseMessage(previous, payload),
        );
      }
    };

    globalThis.window.addEventListener("message", handleMessage);
    return () => {
      globalThis.window.removeEventListener("message", handleMessage);
    };
  }, []);

  const handleStageChatSendIntent = (
    message: Extract<WebviewToHostMessage, { type: "stageChatSendIntent" }>,
  ) => {
    const key = toStageChatSessionKey(message.relativePath, message.stageId);

    setStageChatSessionsByKey((previous) => {
      const existing = previous[key];
      return {
        ...previous,
        [key]: {
          relativePath: message.relativePath,
          stageId: message.stageId,
          stageTitle: message.stageTitle ?? message.stageId,
          runtimeState: "sending",
          statusMessage: "Sending message...",
          lastFailedMessage: "",
          threadKey: existing?.threadKey,
          runtimeClass:
            message.runtime === "local" || message.runtime === "cloud"
              ? message.runtime
              : existing?.runtimeClass,
          sessionStatus: "active",
          availableActions: existing?.availableActions ?? ["resume", "reset", "discard"],
          turns: [
            ...(existing?.turns ?? []),
            {
              role: "user",
              content: message.messageText,
            },
          ],
        },
      };
    });

    props.postMessage(message);
  };

  const { state: shellState, actions: shellActions } = useShellSurfaceSelectionState({
    navigationItems: artifactBrowserShellNavigationItems,
    initialState: {
      activeSurfaceId: props.initialActiveSurfaceId,
      isGuidanceRailOpen: props.initialGuidanceRailOpen,
      activeGuidance: props.initialGuidanceRailOpen
        ? createArtifactBrowserSurfaceGuidancePayload(
            artifactBrowserShellNavigationItems.find(
              (item) => item.id === props.initialActiveSurfaceId,
            ) ?? artifactBrowserShellNavigationItems[0],
          )
        : undefined,
    } satisfies Partial<ShellNavigationGuidanceState>,
  });

  useEffect(() => {
    props.onActiveSurfaceIdChange?.(shellState.activeSurfaceId);
  }, [props.onActiveSurfaceIdChange, shellState.activeSurfaceId]);

  useEffect(() => {
    props.onGuidanceRailOpenChange?.(shellState.isGuidanceRailOpen);
  }, [props.onGuidanceRailOpenChange, shellState.isGuidanceRailOpen]);
  const activeSurface = useMemo(
    () =>
      artifactBrowserShellNavigationItems.find((item) => item.id === shellState.activeSurfaceId),
    [shellState.activeSurfaceId],
  );
  const surfaceGuidancePayload = useMemo(
    () => createArtifactBrowserSurfaceGuidancePayload(activeSurface),
    [activeSurface],
  );
  const handleSelectSurface = (surfaceId: string) => {
    shellActions.selectSurface(surfaceId);

    if (!shellState.isGuidanceRailOpen) {
      return;
    }

    const nextSurface = artifactBrowserShellNavigationItems.find((item) => item.id === surfaceId);
    shellActions.openGuidance(createArtifactBrowserSurfaceGuidancePayload(nextSurface));
  };
  const surfaceSlots = useMemo(
    () =>
      createArtifactBrowserShellSurfaceSlots({
        artifactSurface: (
          <ArtifactBrowserSurface
            model={props.model}
            runtimesModel={props.shellData?.runtimes}
            runsModel={props.shellData?.runs}
            viewState={viewState}
            setViewState={setViewState}
            stageChatSessionsByKey={stageChatSessionsByKey}
            postMessage={props.postMessage}
            onSendStageChatIntent={handleStageChatSendIntent}
            onOpenGuidance={shellActions.openGuidance}
          />
        ),
        runsSurface: (
          <RunsShellSurface model={props.shellData?.runs} postMessage={props.postMessage} />
        ),
        runtimesSurface: (
          <RuntimesShellSurface model={props.shellData?.runtimes} postMessage={props.postMessage} />
        ),
        lifecycleSurface: (
          <LifecycleShellSurface
            model={props.shellData?.lifecycle}
            postMessage={props.postMessage}
          />
        ),
        commandsSurface: (
          <CommandsShellSurface model={props.shellData?.commands} postMessage={props.postMessage} />
        ),
      }),
    [
      props.model,
      props.postMessage,
      props.shellData?.runs,
      props.shellData?.runtimes,
      props.shellData?.lifecycle,
      props.shellData?.commands,
      stageChatSessionsByKey,
      viewState,
    ],
  );

  return (
    <ExperimentalArtifactBrowserShell
      activeSurfaceId={shellState.activeSurfaceId}
      activeGuidance={shellState.activeGuidance}
      isGuidanceRailOpen={shellState.isGuidanceRailOpen}
      onSelectSurface={handleSelectSurface}
      onOpenGuidance={() => shellActions.openGuidance(surfaceGuidancePayload)}
      onCloseGuidance={shellActions.closeGuidance}
      slots={surfaceSlots}
    />
  );
}
