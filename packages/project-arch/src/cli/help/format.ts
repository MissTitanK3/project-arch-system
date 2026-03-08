/**
 * Help formatting utilities for dual-purpose CLI help (humans + AI agents)
 */

export interface HelpSection {
  title: string;
  content: string;
}

export interface CommandExample {
  description: string;
  command: string;
}

export interface AgentMetadata {
  inputValidation?: Record<string, string>;
  outputFormat?: string;
  fileLocation?: string;
  schemaReference?: string;
}

export interface EnhancedHelpOptions {
  usage: string;
  description: string;
  options?: Array<{ flag: string; description: string }>;
  examples?: CommandExample[];
  relatedCommands?: Array<{ command: string; description: string }>;
  agentMetadata?: AgentMetadata;
  commonIssues?: Array<{ issue: string; solution: string }>;
  extraSections?: HelpSection[];
}

/**
 * Format enhanced help output for both humans and AI agents
 */
export function formatEnhancedHelp(opts: EnhancedHelpOptions): string {
  const lines: string[] = [];

  // Usage section
  lines.push(`Usage: ${opts.usage}`);
  lines.push("");
  lines.push(opts.description);
  lines.push("");

  // Options section
  if (opts.options && opts.options.length > 0) {
    lines.push("Options:");
    for (const opt of opts.options) {
      lines.push(`  ${opt.flag.padEnd(20)} ${opt.description}`);
    }
    lines.push("");
  }

  // Examples section
  if (opts.examples && opts.examples.length > 0) {
    lines.push("Examples:");
    for (const example of opts.examples) {
      lines.push(`  # ${example.description}`);
      lines.push(`  ${example.command}`);
      lines.push("");
    }
  }

  // Extra sections (like Task Lanes)
  if (opts.extraSections && opts.extraSections.length > 0) {
    for (const section of opts.extraSections) {
      lines.push(`${section.title}:`);
      lines.push(section.content);
      lines.push("");
    }
  }

  // Agent metadata section
  if (opts.agentMetadata) {
    lines.push("For AI Agents:");

    if (opts.agentMetadata.inputValidation) {
      lines.push("  Input validation:");
      for (const [param, pattern] of Object.entries(opts.agentMetadata.inputValidation)) {
        lines.push(`    - ${param}: ${pattern}`);
      }
      lines.push("");
    }

    if (opts.agentMetadata.outputFormat) {
      lines.push("  Output format:");
      lines.push(`    ${opts.agentMetadata.outputFormat}`);
      lines.push("");
    }

    if (opts.agentMetadata.fileLocation) {
      lines.push("  File location:");
      lines.push(`    ${opts.agentMetadata.fileLocation}`);
      lines.push("");
    }

    if (opts.agentMetadata.schemaReference) {
      lines.push("  Schema reference:");
      lines.push(`    ${opts.agentMetadata.schemaReference}`);
      lines.push("");
    }
  }

  // Common issues section
  if (opts.commonIssues && opts.commonIssues.length > 0) {
    lines.push("Common Issues:");
    for (const issue of opts.commonIssues) {
      lines.push(`  - "${issue.issue}" → ${issue.solution}`);
    }
    lines.push("");
  }

  // Related commands section
  if (opts.relatedCommands && opts.relatedCommands.length > 0) {
    lines.push("See also:");
    for (const related of opts.relatedCommands) {
      lines.push(`  ${related.command.padEnd(30)} ${related.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a table of commands for agent consumption
 */
export function formatCommandCatalog(
  commands: Array<{
    command: string;
    description: string;
    options?: string;
    output?: string;
  }>,
): string {
  const lines: string[] = [];

  for (const cmd of commands) {
    lines.push(`  ${cmd.command}`);
    lines.push(`    ${cmd.description}`);
    if (cmd.options) {
      lines.push(`    Options: ${cmd.options}`);
    }
    if (cmd.output) {
      lines.push(`    Output: ${cmd.output}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
