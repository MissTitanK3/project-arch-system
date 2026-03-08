import path from "path";
import fg from "fast-glob";
import { ZodError } from "zod";
import { decisionSchema } from "../../schemas/decision";
import { readMarkdownWithFrontmatter, writeMarkdownWithFrontmatter } from "../../utils/fs";

export interface MigrationIssue {
  filePath: string;
  relativePath: string;
  missingFields: string[];
  error: string;
}

export interface MigrationResult {
  total: number;
  valid: number;
  invalid: number;
  issues: MigrationIssue[];
}

/**
 * Scan all decision files and identify those with invalid schemas
 */
export async function scanLegacyDecisions(cwd = process.cwd()): Promise<MigrationResult> {
  const files = await fg("roadmap/decisions/**/*.md", {
    cwd,
    absolute: true,
    onlyFiles: true,
  });

  const issues: MigrationIssue[] = [];
  let validCount = 0;

  for (const filePath of files.sort()) {
    try {
      const { data } = await readMarkdownWithFrontmatter<Record<string, unknown>>(filePath);
      decisionSchema.parse(data);
      validCount++;
    } catch (error) {
      const relativePath = path.relative(cwd, filePath);
      const missingFields: string[] = [];

      if (error instanceof ZodError) {
        for (const issue of error.issues) {
          if (issue.code === "invalid_type" && issue.received === "undefined") {
            missingFields.push(issue.path.join("."));
          } else if (issue.code === "invalid_literal") {
            missingFields.push(
              `${issue.path.join(".")} (expected: ${JSON.stringify(issue.expected)})`,
            );
          }
        }
      }

      issues.push({
        filePath,
        relativePath,
        missingFields,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    total: files.length,
    valid: validCount,
    invalid: issues.length,
    issues,
  };
}

/**
 * Attempt to auto-migrate a legacy decision by adding missing required fields
 */
export async function migrateLegacyDecision(
  filePath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, content } = await readMarkdownWithFrontmatter<Record<string, unknown>>(filePath);

    // Build updated object with all required fields
    const updated: Record<string, unknown> = { ...data };

    // Add missing required fields with sensible defaults
    if (!updated.schemaVersion) {
      updated.schemaVersion = "1.0";
    }

    if (!updated.type) {
      updated.type = "decision";
    }

    // Ensure all required fields exist
    if (!updated.scope) {
      updated.scope = {
        kind: "project",
      };
    }

    if (!updated.drivers) {
      updated.drivers = [];
    }

    if (!updated.decision) {
      updated.decision = {
        summary: "(To be documented)",
      };
    }

    if (!updated.alternatives) {
      updated.alternatives = [];
    }

    if (!updated.consequences) {
      updated.consequences = {
        positive: [],
        negative: [],
      };
    }

    if (!updated.links) {
      updated.links = {
        tasks: [],
        codeTargets: [],
        publicDocs: [],
      };
    }

    // Validate the updated data
    const validated = decisionSchema.parse(updated);

    // Write back to file
    await writeMarkdownWithFrontmatter(filePath, validated, content);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Migrate all legacy decisions at once
 */
export async function migrateAllLegacyDecisions(
  cwd = process.cwd(),
): Promise<{ migrated: number; failed: number; errors: Array<{ file: string; error: string }> }> {
  const scan = await scanLegacyDecisions(cwd);
  let migratedCount = 0;
  const errors: Array<{ file: string; error: string }> = [];

  for (const issue of scan.issues) {
    const result = await migrateLegacyDecision(issue.filePath);
    if (result.success) {
      migratedCount++;
    } else {
      errors.push({
        file: issue.relativePath,
        error: result.error ?? "Unknown error",
      });
    }
  }

  return {
    migrated: migratedCount,
    failed: errors.length,
    errors,
  };
}
