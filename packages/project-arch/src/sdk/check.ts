import { runCheck } from "../core/checks/runCheck";
import { OperationResult } from "../types/result";
import { wrap } from "./_utils";

export interface CheckRunOptions {
  failFast?: boolean;
  completenessThreshold?: number;
  coverageMode?: "warning" | "error";
}

export async function checkRun(options: CheckRunOptions = {}): Promise<
  OperationResult<{
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
    compatibility?: {
      surface: "validation" | "reporting";
      mode: "project-scoped-only" | "hybrid" | "legacy-only";
      supported: boolean;
      canonicalRootExists: boolean;
      legacyRootExists: boolean;
      reason: string;
    };
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
  }>
> {
  return wrap(async () =>
    runCheck(process.cwd(), {
      failFast: options.failFast,
      completenessThreshold: options.completenessThreshold,
      coverageMode: options.coverageMode,
    }),
  );
}
