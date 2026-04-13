import * as vscode from "vscode";
import { activateExtension } from "./activation";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await activateExtension(context, vscode);
}

export function deactivate(): void {}
