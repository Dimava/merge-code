import * as vscode from "vscode";
import { execFile } from "child_process";
import * as path from "path";
import { StatusBar } from "./status-bar";
import { MergePanel } from "./panel";
import type { GitExtension, Repository } from "./git";

export const log = vscode.window.createOutputChannel("Merge Code", { log: true });

function getConfig() {
	return vscode.workspace.getConfiguration("mergeCode");
}

function smerge(repoPath: string, args: string[]) {
	const exe = getConfig().get<string>("smerge") ?? "smerge";
	execFile(exe, args, { cwd: repoPath }, (err) => {
		if (err) {
			vscode.window
				.showErrorMessage(
					`Failed to run smerge: ${err.message}`,
					"Open Settings",
				)
				.then((choice) => {
					if (choice === "Open Settings") {
						vscode.commands.executeCommand(
							"workbench.action.openSettings",
							"mergeCode.smerge",
						);
					}
				});
		}
	});
}

function getRepo(git: GitExtension): Repository | undefined {
	const repos = git.getAPI(1).repositories;
	log.info(`getRepo: ${repos.length} repos available`);
	if (repos[0]) {
		log.info(`getRepo: using ${repos[0].rootUri.fsPath}`);
	}
	return repos[0];
}

function getActiveSelection() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return undefined;
	return {
		uri: editor.document.uri,
		start: editor.selection.start.line + 1,
		end: editor.selection.end.line + 1,
	};
}

export function activate(context: vscode.ExtensionContext) {
	log.info("Merge Code activating...");

	const gitExt = vscode.extensions.getExtension<GitExtension>("vscode.git");
	if (!gitExt) {
		log.error("vscode.git extension not found");
		return;
	}
	const git = gitExt.exports;
	const api = git.getAPI(1);
	log.info(`Git API state: ${api.state}, repos: ${api.repositories.length}`);

	api.onDidChangeState((state) => {
		log.info(`Git API state changed: ${state}, repos: ${api.repositories.length}`);
	});
	api.onDidOpenRepository((repo) => {
		log.info(`Repo opened: ${repo.rootUri.fsPath}`);
	});

	const statusBar = new StatusBar(git);
	context.subscriptions.push(statusBar);

	context.subscriptions.push(
		vscode.commands.registerCommand("mergeCode.open", (uri?: vscode.Uri) => {
			const repo = getRepo(git);
			if (!repo) {
				vscode.window.showErrorMessage("No git repository found");
				return;
			}
			smerge(repo.rootUri.fsPath, ["."]);
		}),

		vscode.commands.registerCommand(
			"mergeCode.blame",
			(uri?: vscode.Uri) => {
				const sel = getActiveSelection();
				const fileUri = uri ?? sel?.uri;
				if (!fileUri) {
					vscode.window.showErrorMessage("No file open");
					return;
				}
				const repo = getRepo(git);
				if (!repo) {
					vscode.window.showErrorMessage("No git repository found");
					return;
				}
				const relPath = path.relative(repo.rootUri.fsPath, fileUri.fsPath);
				const args = ["blame", relPath];
				if (sel) args.push(String(sel.start));
				smerge(repo.rootUri.fsPath, args);
			},
		),

		vscode.commands.registerCommand(
			"mergeCode.fileHistory",
			(uri?: vscode.Uri) => {
				const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
				if (!fileUri) {
					vscode.window.showErrorMessage("No file open");
					return;
				}
				const repo = getRepo(git);
				if (!repo) {
					vscode.window.showErrorMessage("No git repository found");
					return;
				}
				const relPath = path.relative(repo.rootUri.fsPath, fileUri.fsPath);
				smerge(repo.rootUri.fsPath, ["search", `file:"${relPath}"`]);
			},
		),

		vscode.commands.registerCommand("mergeCode.lineHistory", () => {
			const sel = getActiveSelection();
			if (!sel) {
				vscode.window.showErrorMessage("No selection");
				return;
			}
			const repo = getRepo(git);
			if (!repo) {
				vscode.window.showErrorMessage("No git repository found");
				return;
			}
			const relPath = path.relative(repo.rootUri.fsPath, sel.uri.fsPath);
			smerge(repo.rootUri.fsPath, [
				"search",
				`file:"${relPath}" line:${sel.start}-${sel.end}`,
			]);
		}),

		vscode.commands.registerCommand(
			"mergeCode.myCommits",
			(uri?: vscode.Uri) => {
				const repo = getRepo(git);
				if (!repo) {
					vscode.window.showErrorMessage("No git repository found");
					return;
				}
				repo.getConfigs().then((configs) => {
					const authorName = configs.find(
						(c) => c.key === "user.name",
					)?.value;
					if (!authorName) {
						vscode.window.showErrorMessage("No git user.name configured");
						return;
					}
					smerge(repo.rootUri.fsPath, [
						"search",
						`author:"${authorName}"`,
					]);
				});
			},
		),

		vscode.commands.registerCommand("mergeCode.openPanel", (uri?: vscode.Uri) => {
			const repo = getRepo(git);
			MergePanel.open(context.extensionUri, repo);
		}),
	);
}

export function deactivate() {}
