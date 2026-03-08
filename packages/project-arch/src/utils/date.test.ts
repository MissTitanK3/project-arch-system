import { describe, it, expect, afterEach, vi } from "vitest";
import { currentDateISO, currentDateCompact } from "./date";

describe("utils/date", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return YYYY-MM-DD format for currentDateISO", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:34:56Z"));

    expect(currentDateISO()).toBe("2026-03-07");
  });

  it("should return YYYYMMDD format for currentDateCompact", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:34:56Z"));

    expect(currentDateCompact()).toBe("20260307");
  });

  it("should zero-pad month and day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T12:00:00Z"));

    expect(currentDateISO()).toBe("2026-01-03");
    expect(currentDateCompact()).toBe("20260103");
  });
});
