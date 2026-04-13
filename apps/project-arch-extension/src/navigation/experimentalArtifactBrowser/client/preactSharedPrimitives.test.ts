import { describe, expect, it } from "vitest";
import {
  ActionRow,
  CodeText,
  createInitialShellLayoutState,
  EmptyState,
  ShellLayout,
  ShellNavigationFrame,
  ShellRegion,
  ShellSidebarNavigation,
  ShellSurfacePane,
  Surface,
  SurfaceSection,
  useShellSurfaceSelectionState,
  joinClassNames,
} from "../../preact";

describe("shared preact primitives boundary", () => {
  it("exports the initial primitive component set", () => {
    expect(typeof Surface).toBe("function");
    expect(typeof SurfaceSection).toBe("function");
    expect(typeof ActionRow).toBe("function");
    expect(typeof EmptyState).toBe("function");
    expect(typeof CodeText).toBe("function");
    expect(typeof ShellLayout).toBe("function");
    expect(typeof ShellRegion).toBe("function");
    expect(typeof ShellNavigationFrame).toBe("function");
    expect(typeof ShellSidebarNavigation).toBe("function");
    expect(typeof ShellSurfacePane).toBe("function");
    expect(typeof useShellSurfaceSelectionState).toBe("function");
  });

  it("joins class names while ignoring empty tokens", () => {
    expect(joinClassNames("alpha", "", undefined, "beta", false, " gamma ")).toBe(
      "alpha beta gamma",
    );
  });

  it("creates deterministic shell layout state defaults and overrides", () => {
    expect(createInitialShellLayoutState()).toEqual({ isHeaderCollapsed: false });
    expect(createInitialShellLayoutState({ isHeaderCollapsed: true })).toEqual({
      isHeaderCollapsed: true,
    });
  });
});
