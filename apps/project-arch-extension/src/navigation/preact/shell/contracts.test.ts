import { describe, expect, it } from "vitest";
import {
  closeShellGuidance,
  createInitialShellNavigationGuidanceState,
  openShellGuidance,
  selectShellSurface,
  type ShellGuidancePayload,
  type ShellNavigationItem,
} from "./contracts";

const navigationItems: ShellNavigationItem[] = [
  { id: "artifacts", label: "Artifacts" },
  { id: "runs", label: "Runs" },
  { id: "runtimes", label: "Runtimes" },
];

const guidancePayload: ShellGuidancePayload = {
  id: "artifacts-overview",
  title: "Artifacts Overview",
  summary: "Shows available artifact actions for the active surface.",
  items: [{ id: "open", label: "Open an artifact" }],
};

describe("shell navigation and guidance contracts", () => {
  it("creates deterministic initial state from navigation contracts", () => {
    expect(createInitialShellNavigationGuidanceState({ navigationItems })).toEqual({
      activeSurfaceId: "artifacts",
      isGuidanceRailOpen: false,
    });

    expect(
      createInitialShellNavigationGuidanceState({
        navigationItems,
        initialState: {
          activeSurfaceId: "runtimes",
          isGuidanceRailOpen: true,
          activeGuidance: guidancePayload,
        },
      }),
    ).toEqual({
      activeSurfaceId: "runtimes",
      isGuidanceRailOpen: true,
      activeGuidance: guidancePayload,
    });
  });

  it("updates active surface only for known navigation items", () => {
    const state = createInitialShellNavigationGuidanceState({ navigationItems });

    const selected = selectShellSurface(state, navigationItems, "runs");
    const unchanged = selectShellSurface(selected, navigationItems, "unknown");

    expect(selected.activeSurfaceId).toBe("runs");
    expect(unchanged).toBe(selected);
  });

  it("opens and closes guidance rail through shell-level contract helpers", () => {
    const state = createInitialShellNavigationGuidanceState({ navigationItems });

    const opened = openShellGuidance(state, guidancePayload);
    const closed = closeShellGuidance(opened);

    expect(opened).toEqual({
      activeSurfaceId: "artifacts",
      activeGuidance: guidancePayload,
      isGuidanceRailOpen: true,
    });
    expect(closed).toEqual({
      activeSurfaceId: "artifacts",
      activeGuidance: guidancePayload,
      isGuidanceRailOpen: false,
    });
  });
});
