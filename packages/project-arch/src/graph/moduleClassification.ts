import path from "path";
import { pathExists, readJson } from "../utils/fs";

export type ModuleLayer = "runtime" | "docs" | "generated" | "infra";

export interface ModuleClassificationRule {
  pattern: string;
  layer: ModuleLayer;
  module?: string;
}

export interface ModuleGraphConfig {
  suppress: string[];
  classify: ModuleClassificationRule[];
}

export interface ModuleTargetClassification {
  normalizedPath: string;
  module: string | null;
  layer: ModuleLayer;
  isRuntime: boolean;
  suppressed: boolean;
}

interface RawGraphConfig {
  suppress?: unknown;
  classify?: unknown;
}

const GRAPH_CONFIG_PATH = ".project-arch/graph.config.json";
const ROOT_INFRA_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "tsconfig.json",
  "tsconfig.base.json",
  "vitest.config.ts",
  "vite.config.ts",
  "README.md",
  "LICENSE",
]);

export async function loadModuleGraphConfig(cwd: string): Promise<ModuleGraphConfig> {
  const configPath = path.join(cwd, GRAPH_CONFIG_PATH);
  if (!(await pathExists(configPath))) {
    return { suppress: [], classify: [] };
  }

  const raw = await readJson<RawGraphConfig>(configPath);
  const suppress = Array.isArray(raw.suppress)
    ? raw.suppress.filter((entry): entry is string => typeof entry === "string")
    : [];

  const classify = Array.isArray(raw.classify)
    ? raw.classify
        .filter(
          (entry): entry is { pattern?: unknown; layer?: unknown; module?: unknown } =>
            !!entry && typeof entry === "object",
        )
        .map((entry) => ({
          pattern: typeof entry.pattern === "string" ? entry.pattern : "",
          layer: toModuleLayer(entry.layer),
          ...(typeof entry.module === "string" ? { module: entry.module } : {}),
        }))
        .filter((entry): entry is ModuleClassificationRule => entry.pattern.length > 0)
    : [];

  return { suppress, classify };
}

export function classifyModuleTarget(
  target: string,
  config: ModuleGraphConfig,
): ModuleTargetClassification {
  const normalizedPath = normalizePath(target);

  if (config.suppress.some((pattern) => matchGlob(normalizedPath, pattern))) {
    return {
      normalizedPath,
      module: null,
      layer: "infra",
      isRuntime: false,
      suppressed: true,
    };
  }

  for (const rule of config.classify) {
    if (!matchGlob(normalizedPath, rule.pattern)) {
      continue;
    }
    const moduleName = rule.module ?? inferModuleForLayer(normalizedPath, rule.layer);
    return {
      normalizedPath,
      module: moduleName,
      layer: rule.layer,
      isRuntime: rule.layer === "runtime",
      suppressed: false,
    };
  }

  const layer = inferLayer(normalizedPath);
  return {
    normalizedPath,
    module: inferModuleForLayer(normalizedPath, layer),
    layer,
    isRuntime: layer === "runtime",
    suppressed: false,
  };
}

function inferLayer(normalizedPath: string): ModuleLayer {
  if (inferRuntimeModule(normalizedPath)) {
    return "runtime";
  }

  if (
    normalizedPath.startsWith("docs/") ||
    normalizedPath.startsWith("architecture/") ||
    normalizedPath.startsWith("roadmap/") ||
    normalizedPath.startsWith("feedback/") ||
    normalizedPath.endsWith(".md")
  ) {
    return "docs";
  }

  if (
    normalizedPath.startsWith(".arch/") ||
    normalizedPath.startsWith("dist/") ||
    normalizedPath.startsWith("build/") ||
    normalizedPath.startsWith("coverage/") ||
    normalizedPath.startsWith(".next/") ||
    normalizedPath.startsWith("generated/") ||
    normalizedPath.includes("/generated/")
  ) {
    return "generated";
  }

  if (
    normalizedPath.startsWith("arch-model/") ||
    normalizedPath.startsWith("arch-domains/") ||
    normalizedPath.startsWith(".project-arch/") ||
    normalizedPath.startsWith("scripts/") ||
    normalizedPath.startsWith(".github/") ||
    ROOT_INFRA_FILES.has(normalizedPath)
  ) {
    return "infra";
  }

  return "infra";
}

function inferModuleForLayer(normalizedPath: string, layer: ModuleLayer): string | null {
  if (layer === "runtime") {
    return inferRuntimeModule(normalizedPath);
  }

  const parts = normalizedPath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts[0]}/${parts[1]}`;
}

function inferRuntimeModule(normalizedPath: string): string | null {
  if (!normalizedPath.startsWith("apps/") && !normalizedPath.startsWith("packages/")) {
    return null;
  }
  const parts = normalizedPath.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function toModuleLayer(value: unknown): ModuleLayer {
  if (value === "runtime" || value === "docs" || value === "generated" || value === "infra") {
    return value;
  }
  return "infra";
}

function matchGlob(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexPattern = escaped
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*")
    .replace(/\?/g, "[^/]");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}
