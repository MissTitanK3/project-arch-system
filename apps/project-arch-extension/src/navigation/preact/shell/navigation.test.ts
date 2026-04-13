import { describe, expect, it } from "vitest";
import { resolveShellSurfaceSlot, type ShellSurfaceSlot } from "./navigation";

const slots: ShellSurfaceSlot[] = [
  {
    id: "artifacts",
    render: () => "artifacts",
  },
  {
    id: "runs",
    render: () => "runs",
  },
];

describe("preact shell navigation composition", () => {
  it("selects matching surface slots and falls back to first slot", () => {
    expect(resolveShellSurfaceSlot(slots, "runs")?.id).toBe("runs");
    expect(resolveShellSurfaceSlot(slots, "unknown")?.id).toBe("artifacts");
    expect(resolveShellSurfaceSlot(slots)?.id).toBe("artifacts");
  });

  it("returns undefined when no slots are registered", () => {
    expect(resolveShellSurfaceSlot([], "artifacts")).toBeUndefined();
  });
});
