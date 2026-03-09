import { describe, it, expect } from "vitest";
import { formatIdList, formatUsageCount, formatNextId } from "./formatIdList";

describe("formatIdList", () => {
  describe("basic cases", () => {
    it("should return '(none)' for empty array", () => {
      expect(formatIdList([])).toBe("(none)");
    });

    it("should display all IDs when count is small", () => {
      const ids = ["001", "002", "003"];
      expect(formatIdList(ids)).toBe("001, 002, 003");
    });

    it("should display all IDs when count equals maxDisplay", () => {
      const ids = ["001", "002", "003", "004", "005", "006", "007"];
      expect(formatIdList(ids, { maxDisplay: 7 })).toBe("001, 002, 003, 004, 005, 006, 007");
    });
  });

  describe("truncation for large lists", () => {
    it("should truncate when count exceeds maxDisplay", () => {
      const ids = ["001", "002", "003", "004", "005", "006", "007", "008"];
      const result = formatIdList(ids, { maxDisplay: 7 });
      expect(result).toBe("001, 002, 003 ... 006, 007, 008 (8 total)");
    });

    it("should truncate very long list intelligently", () => {
      const ids = Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(3, "0"));
      const result = formatIdList(ids);
      expect(result).toBe("001, 002, 003 ... 048, 049, 050 (50 total)");
    });

    it("should truncate maximum lane capacity (99 tasks)", () => {
      const ids = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(3, "0"));
      const result = formatIdList(ids);
      expect(result).toBe("001, 002, 003 ... 097, 098, 099 (99 total)");
    });

    it("should show first N/2 and last N/2 when truncating", () => {
      const ids = ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];
      const result = formatIdList(ids, { maxDisplay: 6 });
      expect(result).toBe("001, 002, 003 ... 008, 009, 010 (10 total)");
    });
  });

  describe("verbose mode", () => {
    it("should show all IDs when verbose is true", () => {
      const ids = Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(3, "0"));
      const result = formatIdList(ids, { verbose: true });
      expect(result).toBe(ids.join(", "));
    });

    it("should ignore maxDisplay when verbose is true", () => {
      const ids = ["001", "002", "003", "004", "005", "006", "007", "008"];
      const result = formatIdList(ids, { maxDisplay: 3, verbose: true });
      expect(result).toBe("001, 002, 003, 004, 005, 006, 007, 008");
    });
  });

  describe("custom maxDisplay", () => {
    it("should respect custom maxDisplay value", () => {
      const ids = ["001", "002", "003", "004", "005", "006"];
      const result = formatIdList(ids, { maxDisplay: 4 });
      expect(result).toBe("001, 002 ... 005, 006 (6 total)");
    });

    it("should handle maxDisplay = 1", () => {
      const ids = ["001", "002", "003"];
      const result = formatIdList(ids, { maxDisplay: 1 });
      expect(result).toBe("001 ... 003 (3 total)");
    });
  });

  describe("edge cases", () => {
    it("should handle single ID", () => {
      expect(formatIdList(["001"])).toBe("001");
    });

    it("should handle non-numeric IDs", () => {
      const ids = ["abc", "def", "ghi"];
      expect(formatIdList(ids)).toBe("abc, def, ghi");
    });

    it("should handle discovered lane IDs (101-199)", () => {
      const ids = Array.from({ length: 50 }, (_, i) => String(i + 101).padStart(3, "0"));
      const result = formatIdList(ids);
      expect(result).toBe("101, 102, 103 ... 148, 149, 150 (50 total)");
    });

    it("should handle backlog lane IDs (901-999)", () => {
      const ids = Array.from({ length: 20 }, (_, i) => String(i + 901).padStart(3, "0"));
      const result = formatIdList(ids);
      expect(result).toBe("901, 902, 903 ... 918, 919, 920 (20 total)");
    });
  });
});

describe("formatUsageCount", () => {
  it("should format basic usage count", () => {
    expect(formatUsageCount(42, 99)).toBe("Used: 42/99");
  });

  it("should format zero usage", () => {
    expect(formatUsageCount(0, 99)).toBe("Used: 0/99");
  });

  it("should format full capacity", () => {
    expect(formatUsageCount(99, 99)).toBe("Used: 99/99");
  });

  it("should support custom label", () => {
    expect(formatUsageCount(10, 50, "Allocated")).toBe("Allocated: 10/50");
  });
});

describe("formatNextId", () => {
  it("should format next available ID", () => {
    expect(formatNextId("043")).toBe("Next: 043");
  });

  it("should format null as 'none available'", () => {
    expect(formatNextId(null)).toBe("Next: (none available)");
  });

  it("should support custom label", () => {
    expect(formatNextId("101", "Available")).toBe("Available: 101");
  });

  it("should format null with custom label", () => {
    expect(formatNextId(null, "Available")).toBe("Available: (none available)");
  });
});
