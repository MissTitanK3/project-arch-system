import { describe, expect, it } from "vitest";
import {
  filterSensitivePaths,
  getDefaultSensitivePathPatterns,
  isSensitivePath,
} from "./sensitivePaths";

describe("utils/sensitivePaths", () => {
  it("exposes expected default sensitive denylist patterns", () => {
    expect(getDefaultSensitivePathPatterns()).toEqual(
      expect.arrayContaining([
        ".env",
        ".env.*",
        "**/*.pem",
        "**/*.key",
        "**/*token*",
        "**/*password*",
      ]),
    );
  });

  it("detects sensitive paths", () => {
    const sensitivePaths = [
      ".env",
      ".env.local",
      "apps/web/.env.production",
      ".npmrc",
      "packages/api/certs/private.key",
      "ops/keys/server.pem",
      "ops/id_rsa",
      "ops/id_ed25519",
      "config/credentials.json",
      "vault/secrets-dev.txt",
      "tmp/auth-token.txt",
      "tmp/db-passwords.md",
      ".ssh/config",
      "users/jane/.ssh/id_rsa",
    ];

    for (const filePath of sensitivePaths) {
      expect(isSensitivePath(filePath)).toBe(true);
    }
  });

  it("does not flag non-sensitive paths", () => {
    const nonSensitivePaths = [
      "README.md",
      "roadmap/manifest.json",
      "packages/project-arch/src/core/reports/generateReport.ts",
      "docs/security.md",
      "architecture/decisions/index.md",
    ];

    for (const filePath of nonSensitivePaths) {
      expect(isSensitivePath(filePath)).toBe(false);
    }
  });

  it("filters sensitive paths while keeping non-sensitive entries", () => {
    const result = filterSensitivePaths([
      "packages/project-arch/src/core/reports/generateReport.ts",
      ".env",
      "docs/security.md",
      "secrets.txt",
      "roadmap/manifest.json",
      "certs/tls.pem",
    ]);

    expect(result.kept).toEqual([
      "packages/project-arch/src/core/reports/generateReport.ts",
      "docs/security.md",
      "roadmap/manifest.json",
    ]);
    expect(result.excluded).toEqual([".env", "secrets.txt", "certs/tls.pem"]);
  });
});
