// ============================================================================
// v3 Architecture Plan
//
// tRPC-style bridge between extension (host) and webview (client).
// Single source of truth for types. Minimal reactivity. Easy to mock.
// ============================================================================

// ── Repo ──

export interface RepoInfo {
  id: string; // normalized path
  path: string;
  name: string; // last segment of path
}

// ── Locations (sidebar tree) ──

export interface Branch {
  name: string;
  hash: string;
  ahead: number; // 0 if not tracking
  behind: number;
  tracking: string | null; // "origin/main"
  date: string; // ISO 8601 (for sorting)
  dateRel: string; // relative ("3 days ago")
}

export interface RemoteBranch {
  name: string;
  hash: string;
  date: string; // ISO 8601 (for sorting)
  dateRel: string; // relative
}

export interface RemoteGroup {
  name: string; // "origin"
  url: string;
  branches: RemoteBranch[];
}

export interface Tag {
  name: string;
  hash: string;
  date: string; // ISO 8601 (for sorting)
  dateRel: string; // relative
}

export interface Stash {
  index: number;
  label: string;
  hash: string;
}

export interface LocationsData {
  head: string;
  headHash: string; // commit hash at HEAD (for detached or branch)
  branches: Branch[];
  remotes: RemoteGroup[];
  tags: Tag[];
  stashes: Stash[];
}

// ── Commits (graph list) ──

export interface CommitEntry {
  hash: string;
  parents: string[];
  subject: string;
  author: string;
  date: string; // ISO 8601
  deco: Decoration[];
  isStash?: true;
  isUncommitted?: true;
  isPlaceholder?: true; // "..." for missing parent in windowed view
}

export interface Decoration {
  type: "branch" | "remote" | "tag" | "stash";
  name: string; // "main", "origin/main", "v1.0"
  isHead?: true; // only on the checked-out branch
}

// ── Commit Detail ──

export interface CommitDetail {
  hash: string;
  parents: string[];
  author: Person;
  committer: Person | null; // null = same as author, skip in UI
  body: string;
  files: FileChange[];
  workingTree?: WorkingTree; // only on __uncommitted__
}

export interface Person {
  name: string;
  email: string;
  date: string; // ISO
}

export interface FileChange {
  path: string;
  mode: "M" | "A" | "D" | "R" | "??";
  added: number; // -1 = binary
  deleted: number;
  hunks: DiffHunk[];
  rawDiffLines?: string[]; // unified diff lines for git-diff-view
  rawDiff?: string; // full unified diff string (with headers) for git-diff-view
  content?: string; // full text for untracked files
}

export interface WorkingTree {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "ctx" | "add" | "del" | "hunk";
  old?: number;
  new?: number;
  text: string;
}

// ── Graph Layout (computed from CommitEntry[]) ──

export interface GraphRow {
  index: number; // position in visible rows array
  commit: CommitEntry;
  col: number; // lane assignment
  width: number; // rightmost lane + 1 at this row

  parentIndices: number[]; // indices into rows[], -1 if not visible
  childIndices: number[]; // indices of rows that list this as parent

  isVisibleRoot: boolean; // no parents in visible list
  isVisibleHead: boolean; // no children in visible list

  edges: Edge[]; // lines from this commit to its parents
  passThrough: number[]; // other lanes with vertical continuation
}

export interface Edge {
  parentIndex: number; // row index of parent, -1 if offscreen
  fromCol: number; // lane at this row (usually = row.col)
  toCol: number; // lane of parent
  color: string;
}

// ── Filters ──
//
// Prefixed string scheme:
//   hiddenCategories: "branches", "remotes", "remotes/origin", "tags", "stashes"
//   hiddenRefs:       "branch:feat", "remote:origin/main", "tag:v1"
//   pinnedRefs:       "branch:main", "remote:origin/develop", "tag:v2.0"
//   expandedMerges:   commit hashes

export interface Filters {
  hiddenCategories: Set<string>;
  hiddenRefs: Set<string>;
  pinnedRefs: Set<string>;
  expandedMerges: Set<string>;
}

// ── App State ──
//
// Reactivity:
//   Reactive (Vue watches):     graph.selected, graph.detail
//   Shallow-reactive (replace): repos.list, locations.*, graph.commits, graph.rows
//   Plain (read on demand):     filters.*

export interface AppState {
  repos: {
    list: RepoInfo[];
    activeId: string | null;
  };

  locations: LocationsData;

  graph: {
    commits: CommitEntry[];
    rows: GraphRow[];
    width: number; // global max across all rows (in lanes)
    selected: { hash: string; index: number } | null;
    detail: CommitDetail | null;
  };

  filters: Filters; // per-repo, keyed by repoId
}

// ── Router Contract ──

export interface RouterQueries {
  getRepos(): Promise<RepoInfo[]>;
  checkRepo(args: { path: string }): Promise<RepoInfo | null>;
  getLocations(args: { repo: string }): Promise<LocationsData>;
  getCommits(args: { repo: string; filters: Filters }): Promise<CommitEntry[]>;
  getCommitDetail(args: { repo: string; hash: string }): Promise<CommitDetail>;
  getPinnedRefs(args: { repo: string }): Promise<string[]>;
}

export interface RouterMutations {
  action(args: { repo: string; action: string; context: unknown }): Promise<void>;
  setPinnedRefs(args: { repo: string; refs: string[] }): Promise<void>;
  focusCommit(args: { repo: string; hash: string }): Promise<CommitEntry[]>;
}

export interface RouterSubscriptions {
  onRepoChanged(cb: () => void): () => void;
  onRepoListChanged(cb: () => void): () => void;
}

export interface Router {
  queries: RouterQueries;
  mutations: RouterMutations;
  subscriptions: RouterSubscriptions;
}
