import { describe, it, expect } from "vitest";
import { laneRanges, formatLaneRange, getLaneRangesTable, idInLaneRange, nextTaskId } from "./task";

describe("Task Lane Utilities", () => {
  describe("laneRanges", () => {
    it("exports lane ranges", () => {
      expect(laneRanges.planned).toEqual({ min: 1, max: 99 });
      expect(laneRanges.discovered).toEqual({ min: 101, max: 199 });
      expect(laneRanges.backlog).toEqual({ min: 901, max: 999 });
    });
  });

  describe("formatLaneRange", () => {
    it("formats planned lane range", () => {
      expect(formatLaneRange("planned")).toBe("001-099");
    });

    it("formats discovered lane range", () => {
      expect(formatLaneRange("discovered")).toBe("101-199");
    });

    it("formats backlog lane range", () => {
      expect(formatLaneRange("backlog")).toBe("901-999");
    });
  });

  describe("getLaneRangesTable", () => {
    it("returns formatted table of all lanes", () => {
      const table = getLaneRangesTable();
      expect(table).toContain("Lane Ranges:");
      expect(table).toContain("planned");
      expect(table).toContain("001-099");
      expect(table).toContain("discovered");
      expect(table).toContain("101-199");
      expect(table).toContain("backlog");
      expect(table).toContain("901-999");
    });
  });

  describe("idInLaneRange", () => {
    describe("planned lane", () => {
      it("accepts valid IDs", () => {
        expect(idInLaneRange("001", "planned")).toBe(true);
        expect(idInLaneRange("050", "planned")).toBe(true);
        expect(idInLaneRange("099", "planned")).toBe(true);
      });

      it("rejects out-of-range IDs", () => {
        expect(idInLaneRange("000", "planned")).toBe(false);
        expect(idInLaneRange("100", "planned")).toBe(false);
        expect(idInLaneRange("101", "planned")).toBe(false);
      });
    });

    describe("discovered lane", () => {
      it("accepts valid IDs", () => {
        expect(idInLaneRange("101", "discovered")).toBe(true);
        expect(idInLaneRange("150", "discovered")).toBe(true);
        expect(idInLaneRange("199", "discovered")).toBe(true);
      });

      it("rejects out-of-range IDs", () => {
        expect(idInLaneRange("099", "discovered")).toBe(false);
        expect(idInLaneRange("100", "discovered")).toBe(false);
        expect(idInLaneRange("200", "discovered")).toBe(false);
      });
    });

    describe("backlog lane", () => {
      it("accepts valid IDs", () => {
        expect(idInLaneRange("901", "backlog")).toBe(true);
        expect(idInLaneRange("950", "backlog")).toBe(true);
        expect(idInLaneRange("999", "backlog")).toBe(true);
      });

      it("rejects out-of-range IDs", () => {
        expect(idInLaneRange("900", "backlog")).toBe(false);
        expect(idInLaneRange("899", "backlog")).toBe(false);
        expect(idInLaneRange("1000", "backlog")).toBe(false);
      });
    });

    it("rejects non-numeric IDs", () => {
      expect(idInLaneRange("abc", "planned")).toBe(false);
      expect(idInLaneRange("", "planned")).toBe(false);
      expect(idInLaneRange("01a", "planned")).toBe(false);
    });
  });

  describe("nextTaskId", () => {
    it("returns first id in lane when none used", () => {
      expect(nextTaskId([], "planned")).toBe("001");
      expect(nextTaskId([], "discovered")).toBe("101");
      expect(nextTaskId([], "backlog")).toBe("901");
    });

    it("returns next available id in planned lane", () => {
      expect(nextTaskId(["001", "002", "003"], "planned")).toBe("004");
    });

    it("fills gaps instead of always appending", () => {
      expect(nextTaskId(["001", "003", "004"], "planned")).toBe("002");
      expect(nextTaskId(["101", "103"], "discovered")).toBe("102");
    });

    it("ignores ids outside the lane range", () => {
      expect(nextTaskId(["101", "901"], "planned")).toBe("001");
    });

    it("throws when lane is exhausted", () => {
      const allPlanned = Array.from({ length: 99 }, (_, index) =>
        String(index + 1).padStart(3, "0"),
      );
      expect(() => nextTaskId(allPlanned, "planned")).toThrow("No available task IDs left");
    });

    it("supports deterministic sequential allocation pattern", () => {
      const used: string[] = [];
      used.push(nextTaskId(used, "planned"));
      used.push(nextTaskId(used, "planned"));
      used.push(nextTaskId(used, "planned"));
      expect(used).toEqual(["001", "002", "003"]);
    });
  });
});
