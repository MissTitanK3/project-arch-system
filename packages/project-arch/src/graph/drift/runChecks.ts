import { DecisionRecord } from "../../core/validation/decisions";
import { TaskRecord } from "../../core/validation/tasks";
import { checkModules } from "./checkModules";
import { checkDomains } from "./checkDomains";
import { checkImports } from "./checkImports";
import { checkTasks } from "./checkTasks";

export type DriftSeverity = "warning" | "error";

export interface DriftFinding {
  severity: DriftSeverity;
  code: string;
  message: string;
}

export async function runDriftChecks(params: {
  cwd?: string;
  taskRecords: TaskRecord[];
  decisionRecords: DecisionRecord[];
}): Promise<DriftFinding[]> {
  const cwd = params.cwd ?? process.cwd();

  const findings: DriftFinding[] = [];
  findings.push(...(await checkModules(cwd, params.decisionRecords)));
  findings.push(...(await checkDomains(cwd, params.taskRecords)));
  findings.push(...(await checkImports(cwd)));
  findings.push(...(await checkTasks(cwd, params.taskRecords, params.decisionRecords)));

  return findings;
}
