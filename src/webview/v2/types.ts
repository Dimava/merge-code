// ── Data shapes ──

export interface BranchEntry {
  name: string;
  commit?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface RefEntry {
  name: string;
  commit?: string;
}

export interface RemoteGroup {
  name: string;
  url: string;
  refs: RefEntry[];
}

export interface StashEntry {
  label: string;
  index: number;
}

export interface SubmoduleEntry {
  name: string;
  path: string;
}

export interface CommitEntry {
  hash: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
  refs: string[];
  isStash?: boolean;
  isUncommitted?: boolean;
}

export interface FileChange {
  path: string;
  added: number;
  deleted: number;
  mode: string;
  content?: string;
  hunks?: {
    combined?: DiffHunk[];
    staged?: DiffHunk[];
    unstaged?: DiffHunk[];
  };
}

export interface DiffLine {
  type: string;
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface CommitDetailData {
  hash: string;
  tree: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  refs: string[];
  body: string;
  files: FileChange[];
  workingTreeChanges?: {
    staged: FileChange[];
    unstaged: FileChange[];
    untracked: FileChange[];
  };
}

export interface PinnedRefs {
  branches: string[];
  remotes: Record<string, string[]>;
  tags: string[];
}

export interface HideCategories {
  branches: boolean;
  remotes: boolean;
  remoteCategories: Record<string, boolean>;
  tags: boolean;
  stashes: boolean;
}

export interface HideConfig {
  categories: HideCategories;
  targets: string[];
}

export interface MenuItem {
  label: string;
  action: string;
}

// ── Host → Webview messages ──

export type HostMessage =
  | LocationsMessage
  | CommitsMessage
  | CommitDetailMessage
  | PinnedRefsMessage
  | ResetHiddenRefsMessage;

export interface LocationsMessage {
  type: "locations";
  repoPath: string;
  head: string;
  branches: BranchEntry[];
  remotes: RemoteGroup[];
  tags: RefEntry[];
  stashes: StashEntry[];
  submodules: SubmoduleEntry[];
}

export interface CommitsMessage {
  type: "commits";
  commits: CommitEntry[];
}

export interface CommitDetailMessage {
  type: "commitDetail";
  detail: CommitDetailData;
}

export interface PinnedRefsMessage {
  type: "pinnedRefs";
  pinned: PinnedRefs;
}

export interface ResetHiddenRefsMessage {
  type: "resetHiddenRefs";
}

// ── Webview → Host messages ──

export type WebviewMessage =
  | { type: "ready" }
  | { type: "webviewLog"; level: string; message: string; data?: unknown }
  | { type: "action"; action: string; context: unknown }
  | { type: "selectCommit"; hash: string }
  | { type: "setHideConfig"; hide: HideConfig }
  | { type: "setPinnedRefs"; pinned: PinnedRefs };
