import * as vscode from "vscode";
import { execFile } from "child_process";

function getSmerge(): string {
	return vscode.workspace.getConfiguration("mergeCode").get("sublimeMergePath", "smerge");
}

function openSmerge(...args: string[]) {
	const smerge = getSmerge();
	execFile(smerge, args, (err) => {
		if (err) {
			vscode.window.showErrorMessage(`Failed to open Sublime Merge: ${err.message}`);
		}
	});
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand("mergeCode.open", () => {
			const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!folder) {
				vscode.window.showErrorMessage("No workspace folder open");
				return;
			}
			openSmerge(folder);
		}),

		vscode.commands.registerCommand("mergeCode.openFile", (uri?: vscode.Uri) => {
			const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
			if (!filePath) {
				vscode.window.showErrorMessage("No file selected");
				return;
			}
			const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
			if (!folder) {
				openSmerge(filePath);
				return;
			}
			openSmerge(folder);
		}),
	);
}

export function deactivate() {}
