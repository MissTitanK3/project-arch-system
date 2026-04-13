import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import {
  closeShellGuidance,
  createInitialShellNavigationGuidanceState,
  openShellGuidance,
  selectShellSurface,
  type ShellGuidancePayload,
  type ShellNavigationGuidanceState,
  type ShellNavigationItem,
} from "./contracts";

export interface ShellSurfaceSlot {
  readonly id: string;
  readonly render: () => ComponentChildren;
}

interface UseShellSurfaceSelectionStateOptions {
  readonly navigationItems: readonly ShellNavigationItem[];
  readonly initialState?: Partial<ShellNavigationGuidanceState>;
}

export interface ShellSurfaceSelectionActions {
  readonly selectSurface: (surfaceId: string) => void;
  readonly openGuidance: (payload: ShellGuidancePayload) => void;
  readonly closeGuidance: () => void;
}

export function useShellSurfaceSelectionState(options: UseShellSurfaceSelectionStateOptions) {
  const [state, setState] = useState<ShellNavigationGuidanceState>(() =>
    createInitialShellNavigationGuidanceState({
      navigationItems: options.navigationItems,
      initialState: options.initialState,
    }),
  );

  const actions = useMemo<ShellSurfaceSelectionActions>(
    () => ({
      selectSurface: (surfaceId: string) => {
        setState((previous) => selectShellSurface(previous, options.navigationItems, surfaceId));
      },
      openGuidance: (payload: ShellGuidancePayload) => {
        setState((previous) => openShellGuidance(previous, payload));
      },
      closeGuidance: () => {
        setState((previous) => closeShellGuidance(previous));
      },
    }),
    [options.navigationItems],
  );

  return { state, actions };
}

export function resolveShellSurfaceSlot(
  slots: readonly ShellSurfaceSlot[],
  activeSurfaceId?: string,
): ShellSurfaceSlot | undefined {
  if (slots.length === 0) {
    return undefined;
  }

  if (typeof activeSurfaceId === "string") {
    const selected = slots.find((slot) => slot.id === activeSurfaceId);
    if (selected) {
      return selected;
    }
  }

  return slots[0];
}

interface ShellSidebarNavigationProps {
  readonly items: readonly ShellNavigationItem[];
  readonly activeSurfaceId?: string;
  readonly onSelectSurface: (surfaceId: string) => void;
}

export function ShellSidebarNavigation(props: ShellSidebarNavigationProps) {
  return (
    <aside class="pa-shell-sidebar" aria-label="Shell surface navigation">
      <nav>
        <ul class="pa-shell-sidebar-list">
          {props.items.map((item) => {
            const isActive = props.activeSurfaceId === item.id;
            return (
              <li key={item.id} class="pa-shell-sidebar-item">
                <button
                  type="button"
                  class="pa-shell-sidebar-button"
                  data-pa-active={isActive ? "true" : "false"}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => props.onSelectSurface(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

interface ShellSurfacePaneProps {
  readonly activeSurfaceId?: string;
  readonly slots: readonly ShellSurfaceSlot[];
}

export function ShellSurfacePane(props: ShellSurfacePaneProps) {
  const activeSlot = resolveShellSurfaceSlot(props.slots, props.activeSurfaceId);

  return (
    <section class="pa-shell-surface-pane" data-pa-shell-surface={activeSlot?.id}>
      {activeSlot ? activeSlot.render() : null}
    </section>
  );
}

interface ShellNavigationFrameProps {
  readonly items: readonly ShellNavigationItem[];
  readonly activeSurfaceId?: string;
  readonly onSelectSurface: (surfaceId: string) => void;
  readonly slots: readonly ShellSurfaceSlot[];
  readonly headerContent?: ComponentChildren;
  readonly activeGuidance?: ShellGuidancePayload;
  readonly isGuidanceRailOpen?: boolean;
  readonly onOpenGuidance?: () => void;
  readonly onCloseGuidance?: () => void;
}

export function ShellNavigationFrame(props: ShellNavigationFrameProps) {
  const [isLeftSheetOpen, setLeftSheetOpen] = useState(false);
  const canOpenGuidance = Boolean(props.onOpenGuidance);
  const hasGuidancePayload = Boolean(props.activeGuidance);
  const isRightSheetOpen = Boolean(props.isGuidanceRailOpen) && hasGuidancePayload;

  const handleSelectSurface = (surfaceId: string) => {
    props.onSelectSurface(surfaceId);
    setLeftSheetOpen(false);
  };

  return (
    <div class="pa-shell-navigation-frame">
      {props.headerContent ? (
        <section class="pa-shell-navigation-header">{props.headerContent}</section>
      ) : null}

      <div class="pa-shell-navigation-toolbar">
        <button
          type="button"
          class="pa-shell-sheet-toggle pa-shell-sheet-toggle-left"
          aria-label="Open navigation menu"
          onClick={() => setLeftSheetOpen(true)}
        >
          ☰
        </button>
        {canOpenGuidance ? (
          <button
            type="button"
            class="pa-shell-sheet-toggle pa-shell-sheet-toggle-right"
            aria-label="Open guidance sheet"
            onClick={() => props.onOpenGuidance?.()}
            disabled={!canOpenGuidance}
          >
            ⓘ
          </button>
        ) : null}
      </div>

      {isLeftSheetOpen ? (
        <button
          type="button"
          class="pa-shell-sheet-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setLeftSheetOpen(false)}
        />
      ) : null}

      {isRightSheetOpen ? (
        <button
          type="button"
          class="pa-shell-sheet-backdrop"
          aria-label="Close guidance sheet"
          onClick={() => props.onCloseGuidance?.()}
        />
      ) : null}

      <aside
        class="pa-shell-sheet pa-shell-sheet-left"
        data-pa-open={isLeftSheetOpen ? "true" : "false"}
        aria-hidden={isLeftSheetOpen ? "false" : "true"}
      >
        <div class="pa-shell-sheet-header">
          <strong>Navigation</strong>
          <button type="button" onClick={() => setLeftSheetOpen(false)}>
            Close
          </button>
        </div>
        <ShellSidebarNavigation
          items={props.items}
          activeSurfaceId={props.activeSurfaceId}
          onSelectSurface={handleSelectSurface}
        />
      </aside>

      {hasGuidancePayload ? (
        <aside
          class="pa-shell-sheet pa-shell-sheet-right"
          data-pa-open={isRightSheetOpen ? "true" : "false"}
          aria-hidden={isRightSheetOpen ? "false" : "true"}
        >
          <div class="pa-shell-sheet-header">
            <strong>{props.activeGuidance?.title ?? "Guidance"}</strong>
            <button type="button" onClick={() => props.onCloseGuidance?.()}>
              Close
            </button>
          </div>
          <div class="pa-shell-sheet-content">
            <p>{props.activeGuidance?.summary ?? "No guidance summary available."}</p>
            {(props.activeGuidance?.items.length ?? 0) > 0 ? (
              <ul>
                {props.activeGuidance?.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </aside>
      ) : null}

      <ShellSurfacePane activeSurfaceId={props.activeSurfaceId} slots={props.slots} />
    </div>
  );
}
