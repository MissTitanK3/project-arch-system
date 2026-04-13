import { useMemo, useState } from "preact/hooks";

export interface ShellLayoutState {
  readonly isHeaderCollapsed: boolean;
}

export interface ShellLayoutStateActions {
  readonly setHeaderCollapsed: (collapsed: boolean) => void;
}

interface UseShellLayoutStateOptions {
  readonly initialState?: Partial<ShellLayoutState>;
}

export function createInitialShellLayoutState(
  initialState?: Partial<ShellLayoutState>,
): ShellLayoutState {
  return {
    isHeaderCollapsed: initialState?.isHeaderCollapsed ?? false,
  };
}

export function setShellHeaderCollapsed(
  state: ShellLayoutState,
  collapsed: boolean,
): ShellLayoutState {
  return state.isHeaderCollapsed === collapsed
    ? state
    : {
        ...state,
        isHeaderCollapsed: collapsed,
      };
}

export function useShellLayoutState(options: UseShellLayoutStateOptions = {}) {
  const [state, setState] = useState<ShellLayoutState>(() =>
    createInitialShellLayoutState(options.initialState),
  );

  const actions = useMemo<ShellLayoutStateActions>(
    () => ({
      setHeaderCollapsed: (collapsed: boolean) => {
        setState((previous) => setShellHeaderCollapsed(previous, collapsed));
      },
    }),
    [],
  );

  return { state, actions };
}
