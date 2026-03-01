import * as vscode from "vscode";
import type { GitExtension, Repository } from "./git";

export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private subscriptions: vscode.Disposable[] = [];
  private repoSubscriptions: vscode.Disposable[] = [];

  constructor(private git: GitExtension) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    this.item.command = "mergeCode.openPanel";

    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("mergeCode")) this.update();
      }),
    );

    const api = this.git.getAPI(1);
    this.subscriptions.push(
      api.onDidOpenRepository(() => this.update()),
      api.onDidCloseRepository(() => this.update()),
    );

    // Also update when API state changes (repos may not be ready yet)
    this.subscriptions.push(api.onDidChangeState(() => this.update()));

    this.update();
  }

  private getRepo(): Repository | undefined {
    return this.git.getAPI(1).repositories[0];
  }

  private update() {
    const config = vscode.workspace.getConfiguration("mergeCode");
    if (!config.get<boolean>("showStatusBar")) {
      this.item.hide();
      return;
    }

    const repo = this.getRepo();
    if (!repo) {
      this.item.hide();
      return;
    }

    this.watchRepo(repo);

    const unstaged = repo.state.workingTreeChanges.length;
    const staged = repo.state.indexChanges.length;

    let text = "";
    if (config.get<boolean>("showBranchName") && repo.state.HEAD?.name) {
      text += `${repo.state.HEAD.name} `;
    }
    text += `$(git-branch) ${unstaged} $(git-commit) ${staged}`;

    this.item.text = text;
    this.item.tooltip = `Open in Sublime Merge\n\nUnstaged: ${unstaged}\nTo be committed: ${staged}`;
    this.item.show();
  }

  private watchRepo(repo: Repository) {
    this.repoSubscriptions.forEach((s) => s.dispose());
    this.repoSubscriptions = [repo.state.onDidChange(() => this.update())];
  }

  dispose() {
    this.item.dispose();
    this.subscriptions.forEach((s) => s.dispose());
    this.repoSubscriptions.forEach((s) => s.dispose());
  }
}
