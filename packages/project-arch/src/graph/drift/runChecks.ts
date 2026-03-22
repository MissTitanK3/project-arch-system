import { DecisionRecord } from "../../core/validation/decisions";
import { TaskRecord } from "../../core/validation/tasks";
import { checkModules } from "./checkModules";
import { checkDomains } from "./checkDomains";
import { checkImports } from "./checkImports";
import { checkTasks } from "./checkTasks";
import {
  checkDecisionCompleteness,
  DisconnectedNodeReport,
  GraphCompletenessSummary,
} from "./checkDecisionCompleteness";

export type DriftSeverity = "warning" | "error";

export interface DriftFinding {
  severity: DriftSeverity;
  code: string;
  message: string;
}

export interface DriftChecksResult {
  findings: DriftFinding[];
  graphCompleteness: {
    summary: GraphCompletenessSummary;
    disconnected: DisconnectedNodeReport;
  };
}

export async function runDriftChecks(params: {
  cwd?: string;
  taskRecords: TaskRecord[];
  decisionRecords: DecisionRecord[];
  completenessThreshold: number;
}): Promise<DriftChecksResult> {
  const cwd = params.cwd ?? process.cwd();

  const findings: DriftFinding[] = [];
  findings.push(...(await checkModules(cwd, params.decisionRecords)));
  findings.push(...(await checkDomains(cwd, params.taskRecords)));
  findings.push(...(await checkImports(cwd)));
  findings.push(...(await checkTasks(cwd, params.taskRecords, params.decisionRecords)));
  const decisionCompleteness = await checkDecisionCompleteness(
    cwd,
    params.taskRecords,
    params.decisionRecords,
    params.completenessThreshold,
  );
  findings.push(...decisionCompleteness.findings);

  return {
    findings,
    graphCompleteness: {
      summary: decisionCompleteness.summary,
      disconnected: decisionCompleteness.disconnected,
    },
  };
}
