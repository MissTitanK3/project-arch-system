export interface ShellNavigationItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
}

export interface ShellGuidanceItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
}

export interface ShellGuidancePayload {
  readonly id: string;
  readonly title: string;
  readonly summary?: string;
  readonly items: readonly ShellGuidanceItem[];
}

export interface ShellNavigationGuidanceState {
  readonly activeSurfaceId?: string;
  readonly activeGuidance?: ShellGuidancePayload;
  readonly isGuidanceRailOpen: boolean;
}

interface CreateInitialShellNavigationGuidanceStateInput {
  readonly navigationItems?: readonly ShellNavigationItem[];
  readonly initialState?: Partial<ShellNavigationGuidanceState>;
}

function hasNavigationItem(
  items: readonly ShellNavigationItem[],
  candidateId: string | undefined,
): boolean {
  return typeof candidateId === "string" && items.some((item) => item.id === candidateId);
}

export function createInitialShellNavigationGuidanceState(
  input: CreateInitialShellNavigationGuidanceStateInput = {},
): ShellNavigationGuidanceState {
  const navigationItems = input.navigationItems ?? [];
  const requestedActiveSurfaceId = input.initialState?.activeSurfaceId;

  const activeSurfaceId = hasNavigationItem(navigationItems, requestedActiveSurfaceId)
    ? requestedActiveSurfaceId
    : navigationItems[0]?.id;

  const activeGuidance = input.initialState?.activeGuidance;
  const isGuidanceRailOpen = Boolean(input.initialState?.isGuidanceRailOpen);

  return {
    ...(activeSurfaceId ? { activeSurfaceId } : {}),
    ...(activeGuidance ? { activeGuidance } : {}),
    isGuidanceRailOpen,
  };
}

export function selectShellSurface(
  state: ShellNavigationGuidanceState,
  navigationItems: readonly ShellNavigationItem[],
  surfaceId: string,
): ShellNavigationGuidanceState {
  if (!hasNavigationItem(navigationItems, surfaceId)) {
    return state;
  }

  if (state.activeSurfaceId === surfaceId) {
    return state;
  }

  return {
    ...state,
    activeSurfaceId: surfaceId,
  };
}

export function openShellGuidance(
  state: ShellNavigationGuidanceState,
  payload: ShellGuidancePayload,
): ShellNavigationGuidanceState {
  if (
    state.isGuidanceRailOpen &&
    state.activeGuidance?.id === payload.id &&
    state.activeGuidance === payload
  ) {
    return state;
  }

  return {
    ...state,
    activeGuidance: payload,
    isGuidanceRailOpen: true,
  };
}

export function closeShellGuidance(
  state: ShellNavigationGuidanceState,
): ShellNavigationGuidanceState {
  if (!state.isGuidanceRailOpen) {
    return state;
  }

  return {
    ...state,
    isGuidanceRailOpen: false,
  };
}
