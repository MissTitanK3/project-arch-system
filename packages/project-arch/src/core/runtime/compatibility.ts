import path from "path";
import { pathExists } from "../../utils/fs";

export type RuntimeCompatibilityMode = "project-scoped-only" | "hybrid" | "legacy-only";
export type RuntimeCompatibilitySurface = "validation" | "reporting";

export interface RuntimeCompatibilityStatus {
  mode: RuntimeCompatibilityMode;
  supported: boolean;
  canonicalRootExists: boolean;
  legacyRootExists: boolean;
}

export interface RuntimeCompatibilityContract extends RuntimeCompatibilityStatus {
  surface: RuntimeCompatibilitySurface;
  supported: boolean;
  reason: string;
}

export async function detectRuntimeCompatibility(
  cwd = process.cwd(),
): Promise<RuntimeCompatibilityStatus> {
  const canonicalRootExists = await pathExists(path.join(cwd, "roadmap", "projects"));
  const legacyRootExists = await pathExists(path.join(cwd, "roadmap", "phases"));

  if (canonicalRootExists && legacyRootExists) {
    return {
      mode: "hybrid",
      supported: true,
      canonicalRootExists,
      legacyRootExists,
    };
  }

  if (canonicalRootExists) {
    return {
      mode: "project-scoped-only",
      supported: true,
      canonicalRootExists,
      legacyRootExists,
    };
  }

  return {
    mode: "legacy-only",
    supported: false,
    canonicalRootExists,
    legacyRootExists,
  };
}

export async function assertSupportedRuntimeCompatibility(
  operation: string,
  cwd = process.cwd(),
): Promise<RuntimeCompatibilityStatus> {
  const status = await detectRuntimeCompatibility(cwd);
  if (!status.supported) {
    throw new Error(
      [
        `${operation} is not supported for legacy-only roadmap runtimes.`,
        "This milestone requires a project-scoped roadmap under 'roadmap/projects/<project>/phases/...'.",
        "Migrate the repository to the project-scoped layout or re-initialize it with the new runtime model before continuing.",
      ].join(" "),
    );
  }
  return status;
}

export async function resolveRuntimeCompatibilityContract(
  surface: RuntimeCompatibilitySurface,
  cwd = process.cwd(),
): Promise<RuntimeCompatibilityContract> {
  const status = await detectRuntimeCompatibility(cwd);

  if (surface === "validation") {
    if (status.mode === "legacy-only") {
      return {
        ...status,
        surface,
        supported: false,
        reason:
          "Validation requires a project-scoped roadmap under 'roadmap/projects/<project>/phases/...'.",
      };
    }

    return {
      ...status,
      surface,
      supported: true,
      reason:
        status.mode === "hybrid"
          ? "Validation runs in hybrid mode and prefers canonical project-scoped roadmap paths."
          : "Validation runs against the canonical project-scoped roadmap.",
    };
  }

  if (status.mode === "legacy-only") {
    return {
      ...status,
      surface,
      supported: true,
      reason:
        "Reporting remains readable for legacy-only repositories, but project-scoped inventory and provenance are unavailable until the roadmap is migrated.",
    };
  }

  return {
    ...status,
    surface,
    supported: true,
    reason:
      status.mode === "hybrid"
        ? "Reporting runs in hybrid mode and renders canonical project-scoped inventory while tolerating legacy mirrors."
        : "Reporting runs against the canonical project-scoped roadmap.",
  };
}
