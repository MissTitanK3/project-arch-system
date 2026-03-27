import commandMetadataJson from "./commands.json";

export interface CommandMetadataEntry {
  description: string;
  inputs: string[];
}

export type CommandMetadataMap = Record<string, CommandMetadataEntry>;

export const commandMetadata = commandMetadataJson as CommandMetadataMap;

export function getCommandMetadata(commandKey: string): CommandMetadataEntry | null {
  return commandMetadata[commandKey] ?? null;
}

export function listCommandMetadataKeys(): string[] {
  return Object.keys(commandMetadata).sort((a, b) => a.localeCompare(b));
}
