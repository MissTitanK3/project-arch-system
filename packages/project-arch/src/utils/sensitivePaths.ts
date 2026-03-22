import path from "path";

const DEFAULT_SENSITIVE_PATH_PATTERNS = [
  ".env",
  ".env.*",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/id_rsa",
  "**/id_ed25519",
  "**/credentials*",
  "**/secrets*",
  "**/*token*",
  "**/*password*",
  ".npmrc",
  ".ssh/**",
] as const;

export type SensitivePathMatchResult = {
  kept: string[];
  excluded: string[];
};

export function getDefaultSensitivePathPatterns(): readonly string[] {
  return DEFAULT_SENSITIVE_PATH_PATTERNS;
}

export function isSensitivePath(inputPath: string): boolean {
  const normalizedPath = normalizePath(inputPath);
  const loweredPath = normalizedPath.toLowerCase();
  const baseName = path.posix.basename(loweredPath);
  const extension = path.posix.extname(baseName);

  if (baseName === ".env" || baseName.startsWith(".env.")) {
    return true;
  }

  if (baseName === ".npmrc") {
    return true;
  }

  if (loweredPath === ".ssh" || loweredPath.startsWith(".ssh/") || loweredPath.includes("/.ssh/")) {
    return true;
  }

  if (baseName === "id_rsa" || baseName === "id_ed25519") {
    return true;
  }

  if (baseName.startsWith("credentials") || baseName.startsWith("secrets")) {
    return true;
  }

  if (baseName.includes("token") || baseName.includes("password")) {
    return true;
  }

  if (
    extension === ".pem" ||
    extension === ".key" ||
    extension === ".p12" ||
    extension === ".pfx"
  ) {
    return true;
  }

  return false;
}

export function filterSensitivePaths(paths: string[]): SensitivePathMatchResult {
  const kept: string[] = [];
  const excluded: string[] = [];

  for (const value of paths) {
    if (isSensitivePath(value)) {
      excluded.push(value);
    } else {
      kept.push(value);
    }
  }

  return {
    kept,
    excluded,
  };
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
