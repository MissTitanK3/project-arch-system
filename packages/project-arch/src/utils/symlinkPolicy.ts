import path from "path";
import fs from "fs-extra";

/**
 * Symlink policy:
 * - Discovery traversals should ignore symlink-derived paths by default.
 * - Any path whose resolved realpath escapes the repository root is rejected.
 * - Managed write/delete targets must pass realpath confinement checks.
 */

function isWithinRoot(resolvedPath: string, rootPath: string): boolean {
  const rootWithSep = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
  return resolvedPath.startsWith(rootWithSep);
}

async function resolveRealRoot(root: string): Promise<string> {
  const absoluteRoot = path.resolve(root);
  try {
    return await fs.realpath(absoluteRoot);
  } catch {
    return absoluteRoot;
  }
}

async function resolveExistingAncestor(targetPath: string): Promise<string> {
  let current = path.resolve(targetPath);
  while (!(await fs.pathExists(current))) {
    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
  return current;
}

export async function assertRealpathWithinRoot(
  targetPath: string,
  root: string,
  label: string,
): Promise<void> {
  const realRoot = await resolveRealRoot(root);
  const absoluteTarget = path.resolve(targetPath);
  const existingAncestor = await resolveExistingAncestor(absoluteTarget);

  let realAncestor: string;
  try {
    realAncestor = await fs.realpath(existingAncestor);
  } catch {
    realAncestor = path.resolve(existingAncestor);
  }

  const suffix = path.relative(existingAncestor, absoluteTarget);
  const resolvedTarget = path.resolve(realAncestor, suffix);

  if (!isWithinRoot(resolvedTarget, realRoot)) {
    throw new Error(
      `${label} resolved to '${resolvedTarget}' which is outside the project root '${realRoot}'`,
    );
  }
}

export async function filterGlobPathsBySymlinkPolicy(
  paths: string[],
  cwd: string,
  options: {
    pathsAreAbsolute?: boolean;
    ignoreSymlinkDerivedPaths?: boolean;
  } = {},
): Promise<string[]> {
  const pathsAreAbsolute = options.pathsAreAbsolute === true;
  const ignoreSymlinkDerivedPaths = options.ignoreSymlinkDerivedPaths !== false;

  const realRoot = await resolveRealRoot(cwd);
  const kept: string[] = [];

  for (const inputPath of paths) {
    const absolutePath = pathsAreAbsolute ? path.resolve(inputPath) : path.resolve(cwd, inputPath);

    let resolvedPath: string;
    try {
      resolvedPath = await fs.realpath(absolutePath);
    } catch {
      continue;
    }

    if (!isWithinRoot(resolvedPath, realRoot)) {
      continue;
    }

    if (ignoreSymlinkDerivedPaths && resolvedPath !== absolutePath) {
      continue;
    }

    kept.push(inputPath);
  }

  return kept;
}
