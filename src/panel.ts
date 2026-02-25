import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import type { Repository, Ref } from "./git";

const execFileAsync = promisify(execFile);

// RefType const enum values
const REF_TYPE_HEAD = 0;
const REF_TYPE_REMOTE_HEAD = 1;
const REF_TYPE_TAG = 2;

export class MergePanel {
	private static current: MergePanel | undefined;
	private panel: vscode.WebviewPanel;
	private repo: Repository | undefined;
	private disposables: vscode.Disposable[] = [];

	static open(extensionUri: vscode.Uri, repo?: Repository) {
		if (MergePanel.current) {
			MergePanel.current.repo = repo;
			MergePanel.current.panel.reveal();
			MergePanel.current.sendLocations();
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
				this.sendLocations();
				this.watchRepo();
			}
		});

		this.panel.onDidDispose(() => {
			MergePanel.current = undefined;
			this.disposables.forEach((d) => d.dispose());
		});
	}

	private watchRepo() {
		if (!this.repo) return;
		this.disposables.push(
			this.repo.state.onDidChange(() => this.sendLocations()),
		);
	}

	private async sendLocations() {
		if (!this.repo) return;
		const state = this.repo.state;

		const branches = state.refs
			.filter((r) => r.type === REF_TYPE_HEAD)
			.map((r) => ({ name: r.name ?? "", commit: r.commit }));

		const remotes = state.remotes.map((remote) => ({
			name: remote.name,
			url: remote.fetchUrl ?? remote.pushUrl ?? "",
			refs: state.refs
				.filter(
					(r) => r.type === REF_TYPE_REMOTE_HEAD && r.remote === remote.name,
				)
				.map((r) => ({
					name: r.name?.replace(`${remote.name}/`, "") ?? "",
					commit: r.commit,
				})),
		}));

		const tags = state.refs
			.filter((r) => r.type === REF_TYPE_TAG)
			.map((r) => ({ name: r.name ?? "", commit: r.commit }));

		const stashes = await this.loadStashes();

		const submodules = state.submodules.map((s) => ({
			name: s.name,
			path: s.path,
		}));

		this.panel.webview.postMessage({
			type: "locations",
			repoPath: this.repo.rootUri.fsPath,
			head: state.HEAD?.name ?? "(detached)",
			branches,
			remotes,
			tags,
			stashes,
			submodules,
		});
	}

	private async loadStashes(): Promise<{ label: string; index: number }[]> {
		if (!this.repo) return [];
		try {
			const result = await execFileAsync(
				"git",
				["stash", "list", "--format=%gs"],
				{ cwd: this.repo.rootUri.fsPath },
			);
			return result.stdout
				.trim()
				.split("\n")
				.filter((l) => l.length > 0)
				.map((label, index) => ({ label, index }));
		} catch {
			return [];
		}
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
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < 32; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}
