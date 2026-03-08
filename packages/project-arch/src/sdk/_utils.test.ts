import { describe, it, expect } from "vitest";
import { ok, fail, wrap, unwrap } from "./_utils";

describe("SDK Utils", () => {
  describe("ok", () => {
    it("should create success result with data", () => {
      const result = ok({ value: 42 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42 });
    });

    it("should work with string data", () => {
      const result = ok("test string");

      expect(result.success).toBe(true);
      expect(result.data).toBe("test string");
    });

    it("should work with null data", () => {
      const result = ok(null);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should work with undefined data", () => {
      const result = ok(undefined);

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe("fail", () => {
    it("should create failure result from Error", () => {
      const error = new Error("Test error");
      const result = fail(error);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Test error"]);
    });

    it("should create failure result from string", () => {
      const result = fail("Error message");

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Error message"]);
    });

    it("should convert non-error objects to strings", () => {
      const result = fail({ some: "object" });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain("object");
    });
  });

  describe("wrap", () => {
    it("should wrap successful async operation", async () => {
      const operation = async () => ({ value: 42 });
      const result = await wrap(operation);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42 });
    });

    it("should catch errors from async operation", async () => {
      const operation = async () => {
        throw new Error("Operation failed");
      };
      const result = await wrap(operation);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Operation failed"]);
    });

    it("should handle async operations returning null", async () => {
      const operation = async () => null;
      const result = await wrap(operation);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should catch and convert non-Error throws", async () => {
      const operation = async () => {
        throw "String error";
      };
      const result = await wrap(operation);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["String error"]);
    });
  });

  describe("unwrap", () => {
    it("should extract data from success result", () => {
      const result = ok({ value: 42 });
      const data = unwrap(result);

      expect(data).toEqual({ value: 42 });
    });

    it("should throw error for failure result", () => {
      const result = fail("Operation failed");

      expect(() => unwrap(result)).toThrow("Operation failed");
    });

    it("should throw with multiple errors joined", () => {
      const result = {
        success: false as const,
        errors: ["Error 1", "Error 2", "Error 3"],
      };

      expect(() => unwrap(result)).toThrow("Error 1; Error 2; Error 3");
    });

    it("should throw default message for failure without errors", () => {
      const result = {
        success: false as const,
      };

      expect(() => unwrap(result)).toThrow("Operation failed");
    });

    it("should handle null data", () => {
      const result = ok(null);
      const data = unwrap(result);

      expect(data).toBeNull();
    });

    it("should throw for success result with undefined data", () => {
      const result = {
        success: true as const,
        data: undefined,
      };

      expect(() => unwrap(result)).toThrow();
    });
  });
});
