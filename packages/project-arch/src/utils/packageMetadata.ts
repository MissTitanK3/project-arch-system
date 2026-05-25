import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads the version from the package.json file.
 * This function is designed to work in both development and built/distributed contexts.
 *
 * It checks multiple possible locations for package.json:
 * 1. Via require.resolve (works in built/installed contexts)
 * 2. Traversing up from the source/dist directory
 */
export function getPackageVersion(): string {
  const possiblePaths: string[] = [];

  // Try require.resolve first
  try {
    const packageJsonPath = require.resolve("../package.json");
    possiblePaths.push(packageJsonPath);
  } catch {
    // Silently fail, we have fallbacks
  }

  // Add paths relative to __dirname (works in both src and dist contexts)
  possiblePaths.push(resolve(__dirname, "../package.json"));
  possiblePaths.push(resolve(__dirname, "../../package.json"));

  // Try all possible paths
  for (const path of possiblePaths) {
    try {
      if (existsSync(path)) {
        const packageJson = JSON.parse(readFileSync(path, "utf-8")) as {
          version?: string;
        };
        if (packageJson.version) {
          return packageJson.version;
        }
      }
    } catch {
      // Silently fail and try next path
    }
  }

  console.warn("Could not read version from package.json, using fallback version");
  return "unknown";
}
