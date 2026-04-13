import { describe, expect, it } from "vitest";
import { createInitialShellLayoutState, setShellHeaderCollapsed } from "./state";

describe("preact shell state", () => {
  it("creates deterministic initial shell state", () => {
    expect(createInitialShellLayoutState()).toEqual({ isHeaderCollapsed: false });
    expect(createInitialShellLayoutState({ isHeaderCollapsed: true })).toEqual({
      isHeaderCollapsed: true,
    });
  });

  it("updates header-collapsed flag only when value changes", () => {
    const initial = createInitialShellLayoutState();
    const collapsed = setShellHeaderCollapsed(initial, true);
    const noChange = setShellHeaderCollapsed(collapsed, true);

    expect(collapsed).toEqual({ isHeaderCollapsed: true });
    expect(noChange).toBe(collapsed);
  });
});
