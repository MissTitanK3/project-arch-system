import path from "path";
import os from "os";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { assertRealpathWithinRoot, filterGlobPathsBySymlinkPolicy } from "./symlinkPolicy";

describe("symlinkPolicy", () => {
  it("keeps regular files within root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-symlink-policy-"));
    try {
      const filePath = path.join(root, "roadmap", "manifest.json");
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, "{}\n", "utf8");

      const filtered = await filterGlobPathsBySymlinkPolicy(["roadmap/manifest.json"], root);
      expect(filtered).toEqual(["roadmap/manifest.json"]);
    } finally {
      await fs.remove(root);
    }
  });

  it("drops symlink-derived paths by default", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-symlink-policy-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pa-symlink-outside-"));
    try {
      const outsideFile = path.join(outside, "outside.json");
      await fs.writeFile(outsideFile, "{}\n", "utf8");

      const linkPath = path.join(root, "roadmap", "outside-link.json");
      await fs.ensureDir(path.dirname(linkPath));
      await fs.symlink(outsideFile, linkPath);

      const filtered = await filterGlobPathsBySymlinkPolicy(["roadmap/outside-link.json"], root);
      expect(filtered).toEqual([]);
    } finally {
      await fs.remove(root);
      await fs.remove(outside);
    }
  });

  it("allows in-root symlink-derived paths only when explicitly enabled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-symlink-policy-"));
    try {
      const target = path.join(root, "roadmap", "manifest.json");
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, "{}\n", "utf8");

      const linkPath = path.join(root, "roadmap", "manifest-link.json");
      await fs.symlink(target, linkPath);

      const defaultFiltered = await filterGlobPathsBySymlinkPolicy(
        ["roadmap/manifest-link.json"],
        root,
      );
      expect(defaultFiltered).toEqual([]);

      const allowedFiltered = await filterGlobPathsBySymlinkPolicy(
        ["roadmap/manifest-link.json"],
        root,
        { ignoreSymlinkDerivedPaths: false },
      );
      expect(allowedFiltered).toEqual(["roadmap/manifest-link.json"]);
    } finally {
      await fs.remove(root);
    }
  });

  it("rejects managed targets that resolve outside root via symlinked parent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-symlink-policy-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pa-symlink-outside-"));
    try {
      const escapeDir = path.join(root, "escape");
      await fs.symlink(outside, escapeDir);

      const escapingTarget = path.join(escapeDir, "report.json");
      await expect(assertRealpathWithinRoot(escapingTarget, root, "report file")).rejects.toThrow(
        /outside the project root/,
      );
    } finally {
      await fs.remove(root);
      await fs.remove(outside);
    }
  });

  it("accepts managed targets that resolve within root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pa-symlink-policy-"));
    try {
      const target = path.join(root, "roadmap", "policy.json");
      await fs.ensureDir(path.dirname(target));
      await expect(assertRealpathWithinRoot(target, root, "policy file")).resolves.toBeUndefined();
    } finally {
      await fs.remove(root);
    }
  });
});
