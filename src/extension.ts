import * as vscode from "vscode";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
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
        .showErrorMessage(`Failed to run smerge: ${err.message}`, "Open Settings")
        .then((choice) => {
          if (choice === "Open Settings") {
            vscode.commands.executeCommand("workbench.action.openSettings", "mergeCode.smerge");
          }
        });
    }
  });
}

function getRepo(git: GitExtension): Repository | undefined {
  const api = git.getAPI(1);
  const repos = api.repositories;
  log.info(`getRepo: ${repos.length} repos available`);

  // Use only the workspace-root repo (no fallbacks).
  const targetFolder = vscode.workspace.workspaceFolders?.[0];
  if (!targetFolder) {
    log.warn("getRepo: no workspace root folder to resolve current repo");
    return undefined;
  }
  const gitMarker = path.join(targetFolder.uri.fsPath, ".git");
  if (!fs.existsSync(gitMarker)) {
    log.warn(`getRepo: workspace root has no .git marker at ${gitMarker}`);
    return undefined;
  }

  const normalizedTarget = path.normalize(targetFolder.uri.fsPath).toLowerCase();
  const match = repos.find(
    (r) => path.normalize(r.rootUri.fsPath).toLowerCase() === normalizedTarget,
  );
  if (match) {
    log.info(`getRepo: matched current workspace repo ${match.rootUri.fsPath}`);
    return match;
  }

  log.warn(`getRepo: no repo exactly matches current workspace folder ${targetFolder.uri.fsPath}`);
  return undefined;
}

function getActiveWorkspaceRepoRoot(): string | undefined {
  const rootFolder = vscode.workspace.workspaceFolders?.[0];
  if (!rootFolder) return undefined;
  const gitMarker = path.join(rootFolder.uri.fsPath, ".git");
  if (!fs.existsSync(gitMarker)) return undefined;
  return path.normalize(rootFolder.uri.fsPath).toLowerCase();
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
  let didOpenPanelOnStart = false;

  const tryOpenPanelOnStart = () => {
    if (didOpenPanelOnStart) return;
    const repo = getRepo(git);
    if (!repo) return;
    didOpenPanelOnStart = true;
    MergePanel.open(context, repo);
  };

  context.subscriptions.push(
    api.onDidChangeState((state) => {
      log.info(`Git API state changed: ${state}, repos: ${api.repositories.length}`);
      tryOpenPanelOnStart();
    }),
    api.onDidOpenRepository((repo) => {
      const activeRepoRoot = getActiveWorkspaceRepoRoot();
      if (!activeRepoRoot) return;
      const openedRoot = path.normalize(repo.rootUri.fsPath).toLowerCase();
      if (openedRoot !== activeRepoRoot) return;
      log.info(`Repo opened: ${repo.rootUri.fsPath}`);
      tryOpenPanelOnStart();
    }),
  );

  const statusBar = new StatusBar(git);
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("mergeCode.open", (_uri?: vscode.Uri) => {
      const repo = getRepo(git);
      if (!repo) {
        vscode.window.showErrorMessage("No git repository found");
        return;
      }
      smerge(repo.rootUri.fsPath, ["."]);
    }),

    vscode.commands.registerCommand("mergeCode.blame", (uri?: vscode.Uri) => {
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
    }),

    vscode.commands.registerCommand("mergeCode.fileHistory", (uri?: vscode.Uri) => {
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
    }),

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
      smerge(repo.rootUri.fsPath, ["search", `file:"${relPath}" line:${sel.start}-${sel.end}`]);
    }),

    vscode.commands.registerCommand("mergeCode.myCommits", (_uri?: vscode.Uri) => {
      const repo = getRepo(git);
      if (!repo) {
        vscode.window.showErrorMessage("No git repository found");
        return;
      }
      void repo.getConfigs().then((configs) => {
        const authorName = configs.find((c) => c.key === "user.name")?.value;
        if (!authorName) {
          vscode.window.showErrorMessage("No git user.name configured");
          return;
        }
        smerge(repo.rootUri.fsPath, ["search", `author:"${authorName}"`]);
      });
    }),

    vscode.commands.registerCommand("mergeCode.openPanel", (_uri?: vscode.Uri) => {
      const repo = getRepo(git);
      MergePanel.open(context, repo);
    }),
  );

  tryOpenPanelOnStart();
}

export function deactivate() {}
