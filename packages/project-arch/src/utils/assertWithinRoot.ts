import path from "path";

/**
 * Assert that a resolved filesystem path is strictly inside the project root.
 *
 * Both `resolved` and `root` are passed through `path.resolve` before comparison,
 * so relative inputs are accepted but compared as absolute paths.
 *
 * A trailing path separator is appended to the root before comparison to prevent
 * prefix-collision false positives:
 *   root  = /foo/bar
 *   path  = /foo/bar-extra/file  ← must NOT pass (shares prefix but is not a child)
 *   path  = /foo/bar/subdir      ← must pass (genuine child)
 *
 * Paths exactly equal to the root are rejected — a valid write or delete target must
 * be a specific file or subdirectory, not the project root directory itself.
 *
 * Throws an Error if `resolved` falls outside or at `root`.
 * The `label` argument names the target in the error message (e.g. "phase directory").
 */
export function assertWithinRoot(resolved: string, root: string, label: string): void {
  const resolvedAbs = path.resolve(resolved);
  const rootAbs = path.resolve(root);
  const rootWithSep = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;

  if (!resolvedAbs.startsWith(rootWithSep)) {
    throw new Error(
      `${label} resolved to '${resolvedAbs}' which is outside the project root '${rootAbs}'`,
    );
  }
}
