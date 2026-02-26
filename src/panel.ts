import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import type { Repository } from "./git";
import { log } from "./extension";

const exec = promisify(execFile);

export class MergePanel {
	private static current: MergePanel | undefined;
	private panel: vscode.WebviewPanel;
	private repo: Repository | undefined;
	private disposables: vscode.Disposable[] = [];

	static open(extensionUri: vscode.Uri, repo?: Repository) {
		log.info(`MergePanel.open: repo=${repo?.rootUri.fsPath ?? "none"}`);
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
				this.sendCommits();
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
			this.repo.state.onDidChange(() => {
				this.sendLocations();
				this.sendCommits();
			}),
		);
	}

	private async git(...args: string[]): Promise<string> {
		if (!this.repo) throw new Error("No repo");
		const result = await exec("git", args, {
			cwd: this.repo.rootUri.fsPath,
		});
		return result.stdout.trim();
	}

	private async gitLines(...args: string[]): Promise<string[]> {
		const out = await this.git(...args);
		if (!out) return [];
		return out.split("\n");
	}

	// ── Data fetching (all via git CLI for reliability) ──

	private async sendLocations() {
		if (!this.repo) {
			log.warn("sendLocations: no repo");
			return;
		}

		const [branches, remotes, tags, stashes, submodules, head] =
			await Promise.all([
				this.loadBranches(),
				this.loadRemotes(),
				this.loadTags(),
				this.loadStashes(),
				this.loadSubmodules(),
				this.git("rev-parse", "--abbrev-ref", "HEAD").catch(() => "(detached)"),
			]);

		log.info(
			`sendLocations: branches=${branches.length}, remotes=${remotes.length}, tags=${tags.length}, stashes=${stashes.length}, head=${head}`,
		);

		this.panel.webview.postMessage({
			type: "locations",
			repoPath: this.repo.rootUri.fsPath,
			head,
			branches,
			remotes,
			tags,
			stashes,
			submodules,
		});
	}

	private async loadBranches() {
		// format: <name>\t<upstream>\t<ahead>\t<behind>\t<commit>
		const lines = await this.gitLines(
			"for-each-ref",
			"--format=%(refname:short)\t%(upstream:short)\t%(upstream:track,nobracket)\t%(objectname:short)",
			"refs/heads/",
		);
		return lines.map((line) => {
			const [name, upstream, track, commit] = line.split("\t");
			let ahead: number | undefined;
			let behind: number | undefined;
			if (track) {
				const aheadMatch = track!.match(/ahead (\d+)/);
				const behindMatch = track!.match(/behind (\d+)/);
				if (aheadMatch) ahead = Number(aheadMatch[1]);
				if (behindMatch) behind = Number(behindMatch[1]);
			}
			return { name: name!, commit, upstream, ahead, behind };
		});
	}

	private async loadRemotes() {
		const remoteNames = await this.gitLines("remote");
		return Promise.all(
			remoteNames.map(async (name) => {
				const url = await this.git("remote", "get-url", name).catch(
					() => "",
				);
				const refLines = await this.gitLines(
					"for-each-ref",
					"--format=%(refname:short)\t%(objectname:short)",
					`refs/remotes/${name}/`,
				);
				const refs = refLines
					.filter((l) => !l.includes("/HEAD"))
					.map((l) => {
						const [fullName, commit] = l.split("\t");
						return {
							name: fullName!.replace(`${name}/`, ""),
							commit,
						};
					});
				return { name, url, refs };
			}),
		);
	}

	private async loadTags() {
		const lines = await this.gitLines(
			"for-each-ref",
			"--format=%(refname:short)\t%(objectname:short)",
			"--sort=-creatordate",
			"refs/tags/",
		);
		return lines.map((l) => {
			const [name, commit] = l.split("\t");
			return { name: name!, commit };
		});
	}

	private async loadStashes() {
		const lines = await this.gitLines("stash", "list", "--format=%gs");
		return lines.map((label, index) => ({ label, index }));
	}

	private async loadSubmodules() {
		try {
			const lines = await this.gitLines(
				"config",
				"--file",
				".gitmodules",
				"--get-regexp",
				"^submodule\\..*\\.path$",
			);
			return lines.map((l) => {
				const match = l.match(/^submodule\.(.+)\.path\s+(.+)$/);
				return {
					name: match?.[1] ?? l,
					path: match?.[2] ?? l,
				};
			});
		} catch {
			return [];
		}
	}

	private async sendCommits() {
		if (!this.repo) return;
		try {
			const lines = await this.gitLines(
				"log",
				"--all",
				"--max-count=100",
				"--format=%H\t%h\t%s\t%an\t%ar\t%D",
			);
			const commits = lines.map((l) => {
				const [hash, short, subject, author, date, refs] = l.split("\t");
				return {
					hash,
					short,
					subject,
					author,
					date,
					refs: refs
						? refs!.split(", ").filter((r) => r.length > 0)
						: [],
				};
			});
			this.panel.webview.postMessage({ type: "commits", commits });
		} catch (err) {
			log.error(`sendCommits failed: ${err}`);
		}
	}

	// ── Actions ──

	private async handleAction(action: string, ctx: Record<string, unknown>) {
		if (!this.repo) return;
		try {
			switch (action) {
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
					await vscode.env.clipboard.writeText(
						(ctx.name as string) ?? (ctx.path as string),
					);
					break;
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
					if (newName)
						await this.git(
							"remote",
							"rename",
							ctx.name as string,
							newName,
						);
					break;
				}
				case "updateRemoteUrl": {
					const newUrl = await vscode.window.showInputBox({
						prompt: `New URL for remote "${ctx.name}"`,
						value: ctx.url as string,
					});
					if (newUrl)
						await this.git(
							"remote",
							"set-url",
							ctx.name as string,
							newUrl,
						);
					break;
				}
				case "copyRemoteUrl":
					await vscode.env.clipboard.writeText(ctx.url as string);
					break;
				case "deleteTag":
					await this.git("tag", "-d", ctx.name as string);
					break;
				case "popStash":
					await this.git("stash", "pop", `stash@{${ctx.index}}`);
					break;
				case "applyStash":
					await this.git("stash", "apply", `stash@{${ctx.index}}`);
					break;
				case "dropStash":
					await this.git("stash", "drop", `stash@{${ctx.index}}`);
					break;
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
			this.sendCommits();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			log.error(`Action "${action}" failed: ${msg}`);
			vscode.window.showErrorMessage(`Action failed: ${msg}`);
		}
	}

	// ── HTML ──

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
