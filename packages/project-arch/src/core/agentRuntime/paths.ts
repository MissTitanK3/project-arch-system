import path from "path";

export const AGENT_RUNTIME_DIR = ".project-arch/agent-runtime" as const;
export const AGENT_CONTRACTS_DIR = `${AGENT_RUNTIME_DIR}/contracts` as const;
export const AGENT_PROMPTS_DIR = `${AGENT_RUNTIME_DIR}/prompts` as const;
export const AGENT_RESULTS_DIR = `${AGENT_RUNTIME_DIR}/results` as const;

export function toPosixRelativePath(basePath: string, targetPath: string): string {
  return path.relative(basePath, targetPath).replace(/\\/g, "/");
}

export function agentRuntimeDirPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_RUNTIME_DIR);
}

export function agentContractsDirPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_CONTRACTS_DIR);
}

export function agentPromptsDirPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_PROMPTS_DIR);
}

export function agentResultsDirPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_RESULTS_DIR);
}

export function agentContractPath(runId: string, cwd = process.cwd()): string {
  return path.join(agentContractsDirPath(cwd), `${runId}.json`);
}

export function agentPromptPath(runId: string, cwd = process.cwd()): string {
  return path.join(agentPromptsDirPath(cwd), `${runId}.md`);
}

export function agentResultPath(runId: string, cwd = process.cwd()): string {
  return path.join(agentResultsDirPath(cwd), `${runId}.json`);
}

export const AGENT_LAUNCHES_DIR = `${AGENT_RUNTIME_DIR}/launches` as const;

export function agentLaunchsDirPath(cwd = process.cwd()): string {
  return path.join(cwd, AGENT_LAUNCHES_DIR);
}

export function agentLaunchRecordPath(runId: string, cwd = process.cwd()): string {
  return path.join(agentLaunchsDirPath(cwd), `${runId}.json`);
}
