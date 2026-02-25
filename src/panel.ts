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
			} else if (msg.type === "action") {
				this.handleAction(msg.action, msg.context);
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
		const repo = this.repo;
		const state = repo.state;

		const branchRefs = state.refs.filter((r) => r.type === REF_TYPE_HEAD);
		const branches = await Promise.all(
			branchRefs.map(async (r) => {
				const name = r.name ?? "";
				// HEAD already has ahead/behind
				if (state.HEAD?.name === name) {
					return {
						name,
						commit: r.commit,
						ahead: state.HEAD.ahead,
						behind: state.HEAD.behind,
						isHead: true,
					};
				}
				// Try to get ahead/behind for other branches
				try {
					const branch = await repo.getBranch(name);
					return {
						name,
						commit: r.commit,
						ahead: branch.ahead,
						behind: branch.behind,
						isHead: false,
					};
				} catch {
					return { name, commit: r.commit, isHead: false };
				}
			}),
		);

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

	private async git(...args: string[]): Promise<string> {
		if (!this.repo) throw new Error("No repo");
		const result = await execFileAsync("git", args, {
			cwd: this.repo.rootUri.fsPath,
		});
		return result.stdout.trim();
	}

	private async handleAction(action: string, ctx: Record<string, unknown>) {
		if (!this.repo) return;
		try {
			switch (action) {
				// Branch actions
				case "checkout":
					await this.repo.checkout(ctx.name as string);
					break;
				case "merge":
					await this.git("merge", ctx.name as string);
					break;
				case "rebase":
					await this.git("rebase", ctx.name as string);
					break;
				case "deleteBranch":
					await this.repo.deleteBranch(ctx.name as string);
					break;
				case "copyName":
					await vscode.env.clipboard.writeText(ctx.name as string ?? ctx.path as string);
					break;

				// Remote actions
				case "fetchRemote":
					await this.repo.fetch(ctx.name as string);
					break;
				case "deleteRemote":
					await this.repo.removeRemote(ctx.name as string);
					break;
				case "renameRemote": {
					const newName = await vscode.window.showInputBox({
						prompt: `Rename remote "${ctx.name}"`,
						value: ctx.name as string,
					});
					if (newName) {
						await this.git("remote", "rename", ctx.name as string, newName);
					}
					break;
				}
				case "updateRemoteUrl": {
					const newUrl = await vscode.window.showInputBox({
						prompt: `New URL for remote "${ctx.name}"`,
						value: ctx.url as string,
					});
					if (newUrl) {
						await this.git(
							"remote",
							"set-url",
							ctx.name as string,
							newUrl,
						);
					}
					break;
				}
				case "copyRemoteUrl":
					await vscode.env.clipboard.writeText(ctx.url as string);
					break;

				// Tag actions
				case "deleteTag":
					await this.git("tag", "-d", ctx.name as string);
					break;

				// Stash actions
				case "popStash":
					await this.git("stash", "pop", `stash@{${ctx.index}}`);
					break;
				case "applyStash":
					await this.git("stash", "apply", `stash@{${ctx.index}}`);
					break;
				case "dropStash":
					await this.git("stash", "drop", `stash@{${ctx.index}}`);
					break;

				// Submodule actions
				case "openSubmodule": {
					const subPath = vscode.Uri.joinPath(
						this.repo.rootUri,
						ctx.path as string,
					);
					await vscode.commands.executeCommand(
						"vscode.openFolder",
						subPath,
						{ forceNewWindow: true },
					);
					break;
				}
				case "updateSubmodule":
					await this.git(
						"submodule",
						"update",
						"--init",
						ctx.path as string,
					);
					break;
				case "copyPath":
					await vscode.env.clipboard.writeText(ctx.path as string);
					break;
			}
			this.sendLocations();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Action failed: ${msg}`);
		}
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
