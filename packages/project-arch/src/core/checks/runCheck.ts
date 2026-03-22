import { runRepositoryChecks } from "../../core/validation/check";

export interface RunCheckOptions {
  failFast?: boolean;
  completenessThreshold?: number;
  coverageMode?: "warning" | "error";
}

export async function runCheck(
  cwd = process.cwd(),
  options: RunCheckOptions = {},
): Promise<{
  ok: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    path: string | null;
    hint: string | null;
  }>;
  graphDiagnostics?: {
    built: boolean;
    completeness: {
      score: number;
      threshold: number;
      sufficient: boolean;
      connectedDecisionNodes: number;
      totalDecisionNodes: number;
    };
    disconnectedNodes: {
      decisionsWithoutDomain: string[];
      decisionsWithoutTaskBackReferences: string[];
      domainsWithoutDecisions: string[];
      taskReferencesToMissingDecisions: Array<{ task: string; decision: string }>;
    };
  };
}> {
  return runRepositoryChecks(cwd, {
    failFast: options.failFast,
    completenessThreshold: options.completenessThreshold,
    coverageMode: options.coverageMode,
  });
}
