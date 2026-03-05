import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import * as path from "path";
import type { Repository } from "./git";
import { log } from "./extension";

const exec = promisify(execFile);

interface PinnedRefs {
  branches: string[];
  remotes: Record<string, string[]>;
  tags: string[];
}

interface HideConfig {
  categories: {
    branches: boolean;
    remotes: boolean;
    remoteCategories: Record<string, boolean>;
    tags: boolean;
    stashes: boolean;
  };
  targets: string[];
}

export class MergePanel {
  private static current: MergePanel | undefined;
  private panel: vscode.WebviewPanel;
  private repo: Repository | undefined;
  private disposables: vscode.Disposable[] = [];
  private hideConfig: HideConfig = {
    categories: {
      branches: false,
      remotes: false,
      remoteCategories: {},
      tags: false,
      stashes: false,
    },
    targets: [],
  };
  private stashRefByHash = new Map<string, string>();
  private context: vscode.ExtensionContext;

  static open(context: vscode.ExtensionContext, repo?: Repository) {
    log.info(`MergePanel.open: repo=${repo?.rootUri.fsPath ?? "none"}`);
    if (MergePanel.current) {
      MergePanel.current.repo = repo;
      MergePanel.current.resetHiddenRefs();
      MergePanel.current.panel.reveal();
      void MergePanel.current.sendLocations();
      void MergePanel.current.sendCommits();
      return;
    }
    MergePanel.current = new MergePanel(context, repo);
  }

  private get pinnedKey() {
    return `mergeCode.pinnedRefs.${this.repo?.rootUri.fsPath ?? "default"}`;
  }

  private loadPinnedRefs(): PinnedRefs {
    return (
      this.context.workspaceState.get<PinnedRefs>(this.pinnedKey) ?? {
        branches: [],
        remotes: {},
        tags: [],
      }
    );
  }

  private savePinnedRefs(pinned: PinnedRefs) {
    this.context.workspaceState.update(this.pinnedKey, pinned);
  }

  private constructor(context: vscode.ExtensionContext, repo?: Repository) {
    this.context = context;
    this.repo = repo;
    const extensionUri = context.extensionUri;
    this.panel = vscode.window.createWebviewPanel(
      "mergeCode",
      "Merge Code",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out", "webview")],
      },
    );

    this.panel.webview.html = this.getHtml(extensionUri);

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "ready") {
        this.resetHiddenRefs();
        void this.sendLocations();
        void this.sendCommits();
        this.sendPinnedRefs();
        this.watchRepo();
      } else if (msg.type === "webviewLog") {
        const level = typeof msg.level === "string" ? msg.level : "info";
        const message = typeof msg.message === "string" ? msg.message : "(no-message)";
        let dataSuffix = "";
        if (msg.data !== undefined) {
          try {
            dataSuffix = ` data=${JSON.stringify(msg.data)}`;
          } catch {
            dataSuffix = " data=[unserializable]";
          }
        }
        const line = `webview:${message}${dataSuffix}`;
        if (level === "error") log.error(line);
        else if (level === "warn") log.warn(line);
        else log.info(line);
      } else if (msg.type === "action") {
        void this.handleAction(msg.action, msg.context);
      } else if (msg.type === "selectCommit") {
        void this.sendCommitDetail(msg.hash);
      } else if (msg.type === "focusCommit") {
        void this.focusCommit(msg.hash);
      } else if (msg.type === "setHideConfig") {
        const categories =
          msg.hide?.categories && typeof msg.hide.categories === "object"
            ? msg.hide.categories
            : {};
        this.hideConfig = {
          categories: {
            branches: Boolean(categories.branches),
            remotes: Boolean(categories.remotes),
            remoteCategories:
              categories.remoteCategories && typeof categories.remoteCategories === "object"
                ? (categories.remoteCategories as Record<string, boolean>)
                : {},
            tags: Boolean(categories.tags),
            stashes: Boolean(categories.stashes),
          },
          targets: Array.isArray(msg.hide?.targets)
            ? msg.hide.targets.filter((v: unknown): v is string => typeof v === "string")
            : [],
        };
        void this.sendCommits();
      } else if (msg.type === "setHiddenRefs") {
        // Backward compatibility: old webview sends explicit refs list
        this.hideConfig = {
          categories: {
            branches: false,
            remotes: false,
            remoteCategories: {},
            tags: false,
            stashes: false,
          },
          targets: Array.isArray(msg.refs)
            ? msg.refs.filter((v: unknown): v is string => typeof v === "string")
            : [],
        };
        void this.sendCommits();
      } else if (msg.type === "setPinnedRefs") {
        this.savePinnedRefs(msg.pinned);
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
        void this.sendLocations();
        void this.sendCommits();
      }),
    );
  }

  private resetHiddenRefs() {
    this.hideConfig = {
      categories: {
        branches: false,
        remotes: false,
        remoteCategories: {},
        tags: false,
        stashes: false,
      },
      targets: [],
    };
    this.panel.webview.postMessage({ type: "resetHiddenRefs" });
  }

  private static normalizeTargetPattern(raw: string): string | undefined {
    const t = raw.trim();
    if (!t) return undefined;
    const toGitPattern = (ref: string): string => (ref.endsWith("/") ? `${ref}*` : ref);
    // Allow direct full refs
    if (t.startsWith("refs/")) return toGitPattern(t);
    if (t.startsWith("branch:")) return toGitPattern(`refs/heads/${t.slice("branch:".length)}`);
    if (t.startsWith("branches:")) return toGitPattern(`refs/heads/${t.slice("branches:".length)}`);
    if (t.startsWith("remote:")) return toGitPattern(`refs/remotes/${t.slice("remote:".length)}`);
    if (t.startsWith("remotes:")) return toGitPattern(`refs/remotes/${t.slice("remotes:".length)}`);
    if (t.startsWith("tag:")) return toGitPattern(`refs/tags/${t.slice("tag:".length)}`);
    if (t.startsWith("tags:")) return toGitPattern(`refs/tags/${t.slice("tags:".length)}`);
    return toGitPattern(`refs/heads/${t}`);
  }

  private buildExcludeRefs(): string[] {
    const refs = new Set<string>();
    const categories = this.hideConfig.categories;

    if (categories.branches) refs.add("refs/heads/*");
    if (categories.remotes) refs.add("refs/remotes/*");
    if (categories.tags) refs.add("refs/tags/*");

    for (const [remoteName, hidden] of Object.entries(categories.remoteCategories)) {
      if (hidden) refs.add(`refs/remotes/${remoteName}/*`);
    }
    for (const target of this.hideConfig.targets) {
      const normalized = MergePanel.normalizeTargetPattern(target);
      if (normalized) refs.add(normalized);
    }
    return [...refs];
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

  private sendPinnedRefs() {
    this.panel.webview.postMessage({
      type: "pinnedRefs",
      pinned: this.loadPinnedRefs(),
    });
  }

  private async sendLocations() {
    if (!this.repo) {
      log.warn("sendLocations: no repo");
      return;
    }

    const [branches, remotes, tags, stashes, submodules, head] = await Promise.all([
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
        const url = await this.git("remote", "get-url", name).catch(() => "");
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
      "--format=%(refname:short)\t%(objectname:short)\t%(creatordate:relative)",
      "--sort=-creatordate",
      "refs/tags/",
    );
    return lines.map((l) => {
      const [name, commit, date] = l.split("\t");
      return { name: name!, commit, date };
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

  private async sendCommits(focusHash?: string) {
    if (!this.repo) return;
    try {
      const excludeRefs = this.buildExcludeRefs();
      const excludeArgs = excludeRefs.flatMap((r) => ["--exclude", r]);
      // Include stash commits in the graph
      const stashEntries = this.hideConfig.categories.stashes
        ? []
        : await this.gitLines("stash", "list", "--format=%H\t%gd").catch(() => [] as string[]);
      const stashRefByHash = new Map<string, string>();
      for (const line of stashEntries) {
        const [hash, ref] = line.split("\t");
        if (hash && ref) stashRefByHash.set(hash, ref);
      }
      this.stashRefByHash = stashRefByHash;
      const stashHashes = [...stashRefByHash.keys()];
      log.info(
        `sendCommits:start repo=${this.repo.rootUri.fsPath} excludeRefs=${excludeRefs.length} stashes=${stashHashes.length}`,
      );

      // Check for uncommitted changes
      const [statusOut, headHash] = await Promise.all([
        this.git("status", "--porcelain").catch(() => ""),
        this.git("rev-parse", "HEAD").catch(() => ""),
      ]);
      const statusLines = statusOut.split("\n").filter((l) => l.length > 0);
      const hasUncommitted = statusLines.length > 0;
      const untrackedCount = statusLines.filter((l) => l.startsWith("?? ")).length;
      const stagedCount = statusLines.filter(
        (l) => !l.startsWith("?? ") && l[0] && l[0] !== " ",
      ).length;
      const unstagedTrackedCount = statusLines.filter(
        (l) => !l.startsWith("?? ") && l[1] && l[1] !== " ",
      ).length;
      const unstagedCount = unstagedTrackedCount + untrackedCount;

      const baseLogArgs = [
        "log",
        ...excludeArgs,
        "--all",
        ...stashHashes,
        "--topo-order",
        "--format=%H\t%P\t%s\t%an\t%ar\t%D",
      ];
      let lines: string[];
      if (focusHash) {
        const focusRadius = 120;
        const focusWindowSize = focusRadius * 2 + 1;
        const prefetchLimit = 3000;
        const prefetchLines = await this.gitLines(
          ...baseLogArgs,
          "--max-count",
          String(prefetchLimit),
        );
        let sourceLines = prefetchLines;
        let idx = sourceLines.findIndex((l) => l.startsWith(`${focusHash}\t`));
        if (idx < 0) {
          // Old commits can be outside the prefetch cap; retry against full history for deterministic focusing.
          sourceLines = await this.gitLines(...baseLogArgs);
          idx = sourceLines.findIndex((l) => l.startsWith(`${focusHash}\t`));
        }
        if (idx >= 0) {
          const start = Math.max(0, idx - focusRadius);
          lines = sourceLines.slice(start, start + focusWindowSize);
        } else {
          // Keep UI and detail pane in sync even if commit is not reachable from --all under current filters.
          const focusLine = await this.git(
            "show",
            "-s",
            "--format=%H\t%P\t%s\t%an\t%ar\t%D",
            focusHash,
          ).catch(() => "");
          if (focusLine) {
            lines = [focusLine, ...prefetchLines.slice(0, Math.max(0, focusWindowSize - 1))];
          } else {
            lines = prefetchLines.slice(0, focusWindowSize);
          }
        }
      } else {
        lines = await this.gitLines(...baseLogArgs, "--max-count=200");
      }
      log.info(
        `sendCommits:gitLog rows=${lines.length} focus=${focusHash ?? "(none)"} hasUncommitted=${hasUncommitted} head=${headHash || "(none)"}`,
      );
      const stashSet = new Set(stashHashes);
      const commits: {
        hash: string;
        parents: string[];
        subject: string;
        author: string;
        date: string;
        refs: string[];
        isStash?: boolean;
        isUncommitted?: boolean;
      }[] = [];

      // Prepend uncommitted changes entry
      if (hasUncommitted && headHash) {
        commits.push({
          hash: "__uncommitted__",
          parents: [headHash],
          subject: `${stagedCount} staged file${stagedCount !== 1 ? "s" : ""}, ${unstagedCount} unstaged file${unstagedCount !== 1 ? "s" : ""}`,
          author: "Commit changes",
          date: "",
          refs: [],
          isUncommitted: true,
        });
      }

      for (const l of lines) {
        const [hash, parents, subject, author, date, refs] = l.split("\t");
        commits.push({
          hash: hash!,
          parents: parents ? parents!.split(" ").filter((p) => p.length > 0) : [],
          subject: subject!,
          author: author!,
          date: date!,
          refs: refs ? refs!.split(", ").filter((r) => r.length > 0) : [],
          isStash: stashSet.has(hash!) || undefined,
        });
      }

      const stashInternalHashes = new Set<string>();
      for (const c of commits) {
        if (c.isStash) {
          for (let i = 1; i < c.parents.length; i++) {
            stashInternalHashes.add(c.parents[i]!);
          }
        }
      }
      const filtered =
        stashInternalHashes.size > 0
          ? commits.filter((c) => !stashInternalHashes.has(c.hash))
          : commits;
      log.info(
        `sendCommits:result total=${commits.length} filtered=${filtered.length} stashInternal=${stashInternalHashes.size}`,
      );
      if (filtered.length === 0) {
        log.warn(
          `sendCommits:empty commits after filtering (excludeRefs=${excludeRefs.length}, gitRows=${lines.length}, stashes=${stashHashes.length})`,
        );
      }

      const payload = { type: "commits", commits: filtered, focusHash };
      const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
      const posted = await this.panel.webview.postMessage(payload);
      log.info(
        `sendCommits:postMessage ok=${posted} bytes=${payloadBytes} commits=${filtered.length}`,
      );
      if (!posted) {
        log.warn("sendCommits:postMessage returned false");
      }
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      log.error(`sendCommits failed: ${message}`);
    }
  }

  private async focusCommit(shortHash: string) {
    if (!this.repo) return;
    try {
      const fullHash = await this.git("rev-parse", shortHash);
      await this.sendCommits(fullHash);
      await this.sendCommitDetail(fullHash);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`focusCommit failed for ${shortHash}: ${message}`);
    }
  }

  private async sendCommitDetail(hash: string) {
    if (!this.repo) return;
    try {
      if (hash === "__uncommitted__") {
        await this.sendUncommittedDetail();
        return;
      }

      const stashRef = this.stashRefByHash.get(hash);
      const [info, diffStat, diffRaw, nameStatusRaw] = await Promise.all([
        this.git(
          "show",
          "--no-patch",
          "--format=%H\t%T\t%P\t%an\t%ae\t%aI\t%cn\t%ce\t%cI\t%D\t%B",
          hash,
        ),
        stashRef
          ? this.git("stash", "show", "--include-untracked", "--numstat", stashRef)
          : this.git(
              "diff-tree",
              "--no-commit-id",
              "-r",
              "--numstat",
              "-m",
              "--first-parent",
              hash,
            ),
        stashRef
          ? this.git("stash", "show", "--include-untracked", "-p", "-U3", stashRef)
          : this.git("diff-tree", "--no-commit-id", "-p", "-U3", "-m", "--first-parent", hash),
        stashRef
          ? this.git("stash", "show", "--include-untracked", "--name-status", stashRef)
          : this.git(
              "diff-tree",
              "--no-commit-id",
              "-r",
              "--name-status",
              "-m",
              "--first-parent",
              hash,
            ),
      ]);
      const parts = info.split("\t");
      const fullHash = parts[0]!;
      const tree = parts[1]!;
      const parents = parts[2] ? parts[2]!.split(" ").filter((p) => p.length > 0) : [];
      const authorName = parts[3]!;
      const authorEmail = parts[4]!;
      const authorDate = parts[5]!;
      const committerName = parts[6]!;
      const committerEmail = parts[7]!;
      const committerDate = parts[8]!;
      const refs = parts[9] ? parts[9]!.split(", ").filter((r) => r.length > 0) : [];
      const body = parts.slice(10).join("\t").trim();

      const statFiles = this.parseNumstat(diffStat);
      const modeByPath = this.parseNameStatus(nameStatusRaw);
      const diffByPath = this.parseDiff(diffRaw);
      const files = statFiles.map((f) => ({
        ...f,
        mode: modeByPath.get(f.path) ?? "M",
        hunks: { combined: diffByPath[f.path] ?? [] },
      }));

      this.panel.webview.postMessage({
        type: "commitDetail",
        detail: {
          hash: fullHash,
          tree,
          parents,
          authorName,
          authorEmail,
          authorDate,
          committerName,
          committerEmail,
          committerDate,
          refs,
          body,
          files,
        },
      });
    } catch (err) {
      log.error(`sendCommitDetail failed: ${err}`);
    }
  }

  private async sendUncommittedDetail() {
    if (!this.repo) return;
    try {
      const [
        headHash,
        diffStat,
        diffRaw,
        statusOut,
        stagedStat,
        unstagedStat,
        stagedRaw,
        unstagedRaw,
      ] = await Promise.all([
        this.git("rev-parse", "HEAD").catch(() => ""),
        this.git("diff", "--numstat", "HEAD").catch(() => ""),
        this.git("diff", "-U3", "HEAD").catch(() => ""),
        this.git("status", "--porcelain").catch(() => ""),
        this.git("diff", "--cached", "--numstat").catch(() => ""),
        this.git("diff", "--numstat").catch(() => ""),
        this.git("diff", "--cached", "-U3").catch(() => ""),
        this.git("diff", "-U3").catch(() => ""),
      ]);

      const files = this.parseNumstat(diffStat);
      const statusByPath = this.parsePorcelainStatus(statusOut);
      const modeByPath = this.parsePorcelainModes(statusOut);
      const stagedFiles = this.parseNumstat(stagedStat).map((f) => ({
        ...f,
        mode: statusByPath.get(f.path)?.x?.trim() || "M",
      }));
      const unstagedFiles = this.parseNumstat(unstagedStat).map((f) => ({
        ...f,
        mode: statusByPath.get(f.path)?.y?.trim() || "M",
      }));
      const stagedDiffByPath = this.parseDiff(stagedRaw);
      const unstagedDiffByPath = this.parseDiff(unstagedRaw);

      // Include untracked files that are not present in `git diff HEAD`.
      const untrackedPaths = statusOut
        .split("\n")
        .filter((l) => l.startsWith("?? "))
        .map((l) => l.slice(3).trim())
        .filter((p) => p.length > 0);
      const untrackedFiles = untrackedPaths.map((path) => ({
        path,
        added: 0,
        deleted: 0,
        mode: "??",
      }));
      const existing = new Set(files.map((f) => f.path));
      for (const path of untrackedPaths) {
        if (!existing.has(path)) {
          files.push({ path, added: 0, deleted: 0 });
        }
      }

      const untrackedContentByPath = new Map<string, string>();
      await Promise.all(
        untrackedPaths.map(async (p) => {
          const content = await this.readWorkingFileContent(p);
          if (content !== undefined) {
            untrackedContentByPath.set(p, content);
          }
        }),
      );

      const combinedDiffByPath = this.parseDiff(diffRaw);
      const detailedFiles = files.map((f) => ({
        ...f,
        mode: modeByPath.get(f.path) ?? "M",
        content: modeByPath.get(f.path) === "??" ? untrackedContentByPath.get(f.path) : undefined,
        hunks: {
          combined: combinedDiffByPath[f.path] ?? [],
          staged: stagedDiffByPath[f.path] ?? [],
          unstaged: unstagedDiffByPath[f.path] ?? [],
        },
      }));
      const detailedByPath = new Map(detailedFiles.map((f) => [f.path, f]));
      const toDetailed = (list: { path: string; added: number; deleted: number; mode: string }[]) =>
        list.map((f) => detailedByPath.get(f.path) ?? f);
      const nowIso = new Date().toISOString();
      this.panel.webview.postMessage({
        type: "commitDetail",
        detail: {
          hash: "__uncommitted__",
          tree: headHash,
          parents: headHash ? [headHash] : [],
          authorName: "Working tree",
          authorEmail: "",
          authorDate: nowIso,
          committerName: "Working tree",
          committerEmail: "",
          committerDate: nowIso,
          refs: [],
          body: "Uncommitted working tree changes compared to HEAD.",
          files: detailedFiles,
          workingTreeChanges: {
            staged: toDetailed(stagedFiles),
            unstaged: toDetailed(unstagedFiles),
            untracked: toDetailed(untrackedFiles),
          },
        },
      });
    } catch (err) {
      log.error(`sendUncommittedDetail failed: ${err}`);
    }
  }

  private parseDiff(raw: string): Record<
    string,
    {
      oldStart: number;
      newStart: number;
      lines: { type: string; oldLine?: number; newLine?: number; text: string }[];
    }[]
  > {
    if (!raw) return {};
    const result: Record<
      string,
      {
        oldStart: number;
        newStart: number;
        lines: { type: string; oldLine?: number; newLine?: number; text: string }[];
      }[]
    > = {};
    const fileSections = raw.split(/^diff --git /m).filter((s) => s.length > 0);

    for (const section of fileSections) {
      const lines = section.split("\n");
      // Extract file path from "a/path b/path"
      const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
      if (!headerMatch) continue;
      const filePath = headerMatch[2]!;
      const hunks: {
        oldStart: number;
        newStart: number;
        lines: { type: string; oldLine?: number; newLine?: number; text: string }[];
      }[] = [];
      let currentHunk: (typeof hunks)[0] | null = null;
      let oldLine = 0;
      let newLine = 0;

      for (const line of lines) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
          currentHunk = {
            oldStart: Number(hunkMatch[1]),
            newStart: Number(hunkMatch[2]),
            lines: [],
          };
          oldLine = Number(hunkMatch[1]);
          newLine = Number(hunkMatch[2]);
          hunks.push(currentHunk);
          // Add hunk header as context
          currentHunk.lines.push({ type: "hunk", text: line });
          continue;
        }
        if (!currentHunk) continue;

        if (line.startsWith("+")) {
          currentHunk.lines.push({ type: "add", newLine, text: line.slice(1) });
          newLine++;
        } else if (line.startsWith("-")) {
          currentHunk.lines.push({ type: "del", oldLine, text: line.slice(1) });
          oldLine++;
        } else if (line.startsWith(" ")) {
          currentHunk.lines.push({ type: "ctx", oldLine, newLine, text: line.slice(1) });
          oldLine++;
          newLine++;
        }
      }
      result[filePath] = hunks;
    }
    return result;
  }

  private parseNumstat(raw: string): { path: string; added: number; deleted: number }[] {
    if (!raw) return [];
    return raw
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => {
        const [added, deleted, ...pathParts] = l.split("\t");
        const path = pathParts[pathParts.length - 1] ?? "";
        return {
          path,
          added: added === "-" ? -1 : Number(added),
          deleted: deleted === "-" ? -1 : Number(deleted),
        };
      })
      .filter((f) => f.path.length > 0);
  }

  private parseNameStatus(raw: string): Map<string, string> {
    const result = new Map<string, string>();
    if (!raw) return result;
    for (const line of raw.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      if (parts.length < 2) continue;
      const status = parts[0]!;
      const path = parts[parts.length - 1]!;
      result.set(path, status);
    }
    return result;
  }

  private parsePorcelainModes(raw: string): Map<string, string> {
    const statusByPath = this.parsePorcelainStatus(raw);
    const result = new Map<string, string>();
    for (const [path, { x, y }] of statusByPath.entries()) {
      if (x === "?" && y === "?") {
        result.set(path, "??");
        continue;
      }
      const sx = x.trim();
      const sy = y.trim();
      if (sx && sy) result.set(path, sx === sy ? sx : `${sx}/${sy}`);
      else result.set(path, sx || sy || "M");
    }
    return result;
  }

  private parsePorcelainStatus(raw: string): Map<string, { x: string; y: string }> {
    const result = new Map<string, { x: string; y: string }>();
    if (!raw) return result;
    for (const line of raw.split("\n")) {
      if (line.length < 4) continue;
      const x = line[0] ?? " ";
      const y = line[1] ?? " ";
      const pathRaw = line.slice(3).trim();
      if (!pathRaw) continue;
      const path = pathRaw.includes(" -> ") ? pathRaw.split(" -> ").at(-1)! : pathRaw;
      result.set(path, { x, y });
    }
    return result;
  }

  private async readWorkingFileContent(relPath: string): Promise<string | undefined> {
    if (!this.repo) return undefined;
    try {
      const absPath = path.join(this.repo.rootUri.fsPath, relPath);
      const stat = await fs.stat(absPath);
      const maxBytes = 128 * 1024;
      if (!stat.isFile() || stat.size > maxBytes) return undefined;
      const content = await fs.readFile(absPath);
      if (content.includes(0)) return undefined;
      return content.toString("utf8");
    } catch {
      return undefined;
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
          await vscode.env.clipboard.writeText((ctx.name as string) ?? (ctx.path as string));
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
          if (newName) await this.git("remote", "rename", ctx.name as string, newName);
          break;
        }
        case "updateRemoteUrl": {
          const newUrl = await vscode.window.showInputBox({
            prompt: `New URL for remote "${ctx.name}"`,
            value: ctx.url as string,
          });
          if (newUrl) await this.git("remote", "set-url", ctx.name as string, newUrl);
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
          const subPath = vscode.Uri.joinPath(this.repo.rootUri, ctx.path as string);
          await vscode.commands.executeCommand("vscode.openFolder", subPath, {
            forceNewWindow: true,
          });
          break;
        }
        case "updateSubmodule":
          await this.git("submodule", "update", "--init", ctx.path as string);
          break;
        case "copyPath":
          await vscode.env.clipboard.writeText(ctx.path as string);
          break;
      }
      void this.sendLocations();
      void this.sendCommits();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Action "${action}" failed: ${msg}`);
      vscode.window.showErrorMessage(`Action failed: ${msg}`);
    }
  }

  // ── HTML ──

  private getHtml(extensionUri: vscode.Uri): string {
    const webviewDir = vscode.Uri.joinPath(extensionUri, "out", "webview");
    const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, "main.js"));
    const styleUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, "main.css"));
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
