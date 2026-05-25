import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPackageVersion } from "./packageMetadata";

const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8")) as {
  version: string;
};

describe("utils/packageMetadata", () => {
  describe("getPackageVersion", () => {
    it("should return a version string from package.json", () => {
      const version = getPackageVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe("string");
    });

    it("should return a valid semantic version", () => {
      const version = getPackageVersion();
      // Simple semver check: x.y.z format
      const semverRegex = /^\d+\.\d+\.\d+/;
      expect(version).toMatch(semverRegex);
    });

    it("should match the version declared in package.json", () => {
      const version = getPackageVersion();
      expect(version).toBe(packageJson.version);
    });
  });
});
