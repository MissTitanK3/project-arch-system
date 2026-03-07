import path from "path";
import { TaskRecord } from "../../core/validation/tasks";
import { pathExists, readJson } from "../../fs";
import { DriftFinding } from "./runChecks";

interface DomainSpec {
  name: string;
  ownedPackages: string[];
}

export async function checkDomains(
  cwd: string,
  taskRecords: TaskRecord[],
): Promise<DriftFinding[]> {
  const findings: DriftFinding[] = [];
  const domainsPath = path.join(cwd, "arch-domains", "domains.json");

  if (!(await pathExists(domainsPath))) {
    findings.push({
      severity: "warning",
      code: "ARCH_DOMAINS_MISSING",
      message: "arch-domains/domains.json not found; domain drift checks skipped.",
    });
    return findings;
  }

  const raw = await readJson<{ domains?: unknown }>(domainsPath);
  const domains: DomainSpec[] = Array.isArray(raw.domains)
    ? raw.domains
        .filter(
          (item): item is { name: string; ownedPackages?: unknown } =>
            !!item && typeof item === "object" && typeof item.name === "string",
        )
        .map((item) => ({
          name: item.name.toLowerCase(),
          ownedPackages: Array.isArray(item.ownedPackages)
            ? item.ownedPackages.filter((v): v is string => typeof v === "string")
            : [],
        }))
    : [];

  const byName = new Map(domains.map((domain) => [domain.name, domain]));

  for (const task of taskRecords) {
    const domainTags = task.frontmatter.tags
      .map((tag) => parseDomainTag(tag))
      .filter((tag): tag is string => tag !== null);

    for (const domainName of domainTags) {
      const domain = byName.get(domainName);
      if (!domain) {
        continue;
      }

      for (const target of task.frontmatter.codeTargets) {
        const module = toRuntimeModule(target);
        if (!module) {
          continue;
        }
        if (!domain.ownedPackages.includes(module)) {
          findings.push({
            severity: "error",
            code: "DOMAIN_VIOLATION",
            message: `${module} in task ${task.phaseId}/${task.milestoneId}/${task.frontmatter.id} is outside domain '${domainName}' ownership`,
          });
        }
      }
    }
  }

  return findings;
}

function parseDomainTag(tag: string): string | null {
  const lower = tag.toLowerCase();
  if (!lower.startsWith("domain:")) {
    return null;
  }
  const value = lower.slice("domain:".length).trim();
  return value.length > 0 ? value : null;
}

function toRuntimeModule(target: string): string | null {
  const normalized = target.replace(/\\/g, "/");
  if (!normalized.startsWith("apps/") && !normalized.startsWith("packages/")) {
    return null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}
