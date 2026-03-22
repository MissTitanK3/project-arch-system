import { describe, it, expect } from "vitest";
import path from "path";
import { assertWithinRoot } from "./assertWithinRoot";

const ROOT = "/project/root";

describe("assertWithinRoot", () => {
  describe("paths inside root (should not throw)", () => {
    it("accepts a direct child file", () => {
      expect(() => assertWithinRoot(`${ROOT}/file.md`, ROOT, "file")).not.toThrow();
    });

    it("accepts a nested subdirectory", () => {
      expect(() =>
        assertWithinRoot(`${ROOT}/roadmap/phases/phase-1`, ROOT, "phase directory"),
      ).not.toThrow();
    });

    it("accepts a deeply nested path", () => {
      expect(() =>
        assertWithinRoot(
          `${ROOT}/roadmap/phases/phase-1/milestones/m1/tasks/planned/001-task.md`,
          ROOT,
          "task file",
        ),
      ).not.toThrow();
    });

    it("accepts a path within .project-arch", () => {
      expect(() =>
        assertWithinRoot(`${ROOT}/.project-arch/reconcile/report.json`, ROOT, "report"),
      ).not.toThrow();
    });
  });

  describe("paths exactly equal to root (should throw)", () => {
    // Design decision: the project root itself is not a valid write or delete target.
    // A write/delete target must be a specific file or subdirectory inside the root.
    // path.resolve strips trailing separators, so both forms resolve identically.
    it("rejects path exactly equal to root (no trailing separator)", () => {
      expect(() => assertWithinRoot(ROOT, ROOT, "directory")).toThrow(
        /is outside the project root/,
      );
    });

    it("rejects path equal to root with trailing separator (resolve strips it)", () => {
      // path.resolve("/project/root/") === "/project/root", which does not start with
      // "/project/root/" — so this is correctly rejected.
      expect(() => assertWithinRoot(`${ROOT}/`, ROOT, "directory")).toThrow(
        /is outside the project root/,
      );
    });
  });

  describe("paths outside root via .. traversal (should throw)", () => {
    it("rejects simple .. traversal", () => {
      expect(() => assertWithinRoot(`${ROOT}/../../etc/passwd`, ROOT, "evil path")).toThrow(
        /is outside the project root/,
      );
    });

    it("rejects single-level parent escape", () => {
      expect(() => assertWithinRoot(`/project/other-dir`, ROOT, "sibling dir")).toThrow(
        /is outside the project root/,
      );
    });

    it("rejects absolute path to /tmp", () => {
      expect(() => assertWithinRoot("/tmp/malicious", ROOT, "temp file")).toThrow(
        /is outside the project root/,
      );
    });

    it("rejects path to /etc/passwd", () => {
      expect(() => assertWithinRoot("/etc/passwd", ROOT, "sensitive file")).toThrow(
        /is outside the project root/,
      );
    });
  });

  describe("paths sharing prefix but not children (should throw)", () => {
    it("rejects a path that shares root prefix but is a sibling directory", () => {
      // /project/root and /project/root-extra — same prefix, different dir
      expect(() =>
        assertWithinRoot("/project/root-extra/file.json", ROOT, "sibling-prefixed path"),
      ).toThrow(/is outside the project root/);
    });

    it("rejects a path that is the parent of root", () => {
      expect(() => assertWithinRoot("/project", ROOT, "parent dir")).toThrow(
        /is outside the project root/,
      );
    });
  });

  describe("error message contents", () => {
    it("includes the label in the error message", () => {
      expect(() => assertWithinRoot("/evil/path", ROOT, "task file")).toThrow(/task file/);
    });

    it("includes the resolved path in the error message", () => {
      expect(() => assertWithinRoot("/evil/path", ROOT, "task file")).toThrow(/\/evil\/path/);
    });

    it("includes the root in the error message", () => {
      const resolvedRoot = path.resolve(ROOT);
      expect(() => assertWithinRoot("/evil/path", ROOT, "task file")).toThrow(
        new RegExp(resolvedRoot.replace(/[/\\]/g, "[\\\\/]")),
      );
    });
  });

  describe("accepts relative paths (resolved to absolute internally)", () => {
    it("accepts a relative child path when root is absolute", () => {
      // Both resolved: relative child of ROOT becomes an absolute path.
      // Here we use the real process.cwd() as root so relative resolution works.
      const root = process.cwd();
      expect(() => assertWithinRoot("some-subdir/file.md", root, "file")).not.toThrow();
    });
  });
});
