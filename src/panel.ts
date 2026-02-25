import * as vscode from "vscode";
import * as path from "path";
import type { Repository } from "./git";

export class MergePanel {
	private static current: MergePanel | undefined;
	private panel: vscode.WebviewPanel;
	private repo: Repository | undefined;

	static open(extensionUri: vscode.Uri, repo?: Repository) {
		if (MergePanel.current) {
			MergePanel.current.repo = repo;
			MergePanel.current.panel.reveal();
			MergePanel.current.sendRepoInfo();
			return;
		}
		MergePanel.current = new MergePanel(extensionUri, repo);
	}

	private constructor(extensionUri: vscode.Uri, repo?: Repository) {
		this.repo = repo;
		this.panel = vscode.window.createWebviewPanel(
			"mergeCode",
			"Merge Code",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, "out", "webview"),
				],
			},
		);

		this.panel.webview.html = this.getHtml(extensionUri);

		this.panel.webview.onDidReceiveMessage((msg) => {
			if (msg.type === "ready") {
				this.sendRepoInfo();
			}
		});

		this.panel.onDidDispose(() => {
			MergePanel.current = undefined;
		});
	}

	private sendRepoInfo() {
		if (!this.repo) return;
		this.panel.webview.postMessage({
			type: "repoInfo",
			repoPath: this.repo.rootUri.fsPath,
			branch: this.repo.state.HEAD?.name ?? "(detached)",
		});
	}

	private getHtml(extensionUri: vscode.Uri): string {
		const webviewDir = vscode.Uri.joinPath(extensionUri, "out", "webview");
		const scriptUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(webviewDir, "main.js"),
		);
		const styleUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(webviewDir, "main.css"),
		);
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<link rel="stylesheet" href="${styleUri}">
	<title>Merge Code</title>
</head>
<body>
	<div id="app"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < 32; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}
