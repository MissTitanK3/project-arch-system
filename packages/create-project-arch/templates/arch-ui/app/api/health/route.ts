import { NextResponse } from "next/server";
import { check } from "project-arch";
import { getProjectRoot } from "../../../lib/project-root";
import { readArchitectureMap } from "../../../lib/arch-model";
import { buildValidatedGraphDataset } from "../../../lib/graph-dataset";

export const runtime = "nodejs";

export async function GET() {
  const root = getProjectRoot();
  process.env.PROJECT_ROOT = root;
  const [checkResult, architectureMap] = await Promise.all([check.checkRun(), readArchitectureMap(root)]);
  const { validation } = await buildValidatedGraphDataset(root, architectureMap);

  const graphErrors = validation.errors.map(
    (issue) => `[graph:${issue.ruleId}] ${issue.message}`,
  );
  const graphWarnings = validation.warnings.map(
    (issue) => `[graph:${issue.ruleId}] ${issue.message}`,
  );

  const maybeWrapped = checkResult as {
    success?: boolean;
    data?: { ok: boolean; errors: string[]; warnings: string[] };
    errors?: string[];
  };
  const base =
    maybeWrapped.data ??
    ({
      ok: true,
      errors: maybeWrapped.errors ?? [],
      warnings: [],
    } as { ok: boolean; errors: string[]; warnings: string[] });

  return NextResponse.json({
    success: maybeWrapped.success ?? true,
    data: {
      ...base,
      ok: base.ok && graphErrors.length === 0,
      errors: [...base.errors, ...graphErrors],
      warnings: [...base.warnings, ...graphWarnings],
    },
  });
}
