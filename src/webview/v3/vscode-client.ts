import type {
  RouterQueries,
  RouterMutations,
  RouterSubscriptions,
  Router,
  LocationsData,
  CommitEntry,
  CommitDetail,
  Decoration,
  DiffHunk,
  FileChange,
} from "./plan";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

type LegacyLocationsMessage = {
  type: "locations";
  repoPath: string;
  head?: string;
  headHash?: string;
  branches?: Array<{
    name: string;
    commit?: string;
    hash?: string;
    upstream?: string;
    tracking?: string | null;
    ahead?: number;
    behind?: number;
    date?: string;
    dateRel?: string;
  }>;
  remotes?: Array<{
    name: string;
    url?: string;
    refs?: Array<{ name: string; commit?: string; hash?: string; date?: string; dateRel?: string }>;
    branches?: Array<{ name: string; commit?: string; hash?: string; date?: string; dateRel?: string }>;
  }>;
  tags?: Array<{ name: string; commit?: string; hash?: string; date?: string; dateRel?: string }>;
  stashes?: Array<{ index: number; label: string; hash?: string }>;
};

type LegacyCommitsMessage = {
  type: "commits";
  commits: Array<{
    hash: string;
    parents: string[];
    subject: string;
    author: string;
    date: string;
    refs?: string[];
    isStash?: boolean;
    isUncommitted?: boolean;
    isPlaceholder?: boolean;
  }>;
  focusHash?: string;
};

type LegacyDiffLine = { type: string; oldLine?: number; newLine?: number; text: string };
type LegacyDiffHunk = { oldStart: number; newStart: number; lines: LegacyDiffLine[] };
type LegacyFile = {
  path: string;
  mode: string;
  added: number;
  deleted: number;
  content?: string;
  hunks?: { combined?: LegacyDiffHunk[]; staged?: LegacyDiffHunk[]; unstaged?: LegacyDiffHunk[] };
};
type LegacyCommitDetail = {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  body: string;
  files: LegacyFile[];
  workingTreeChanges?: {
    staged: LegacyFile[];
    unstaged: LegacyFile[];
    untracked: LegacyFile[];
  };
};
type LegacyCommitDetailMessage = {
  type: "commitDetail";
  detail: LegacyCommitDetail;
};

type LegacyPinnedRefs = {
  branches: string[];
  remotes: Record<string, string[]>;
  tags: string[];
};

type LegacyPinnedRefsMessage = {
  type: "pinnedRefs";
  pinned: LegacyPinnedRefs;
};

type SubscriptionMessage = { type: "subscription"; event?: string };

type IncomingMessage =
  | LegacyLocationsMessage
  | LegacyCommitsMessage
  | LegacyCommitDetailMessage
  | LegacyPinnedRefsMessage
  | SubscriptionMessage
  | { type?: string };

type Waiter<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  predicate?: (value: T) => boolean;
  timer: number;
};

const EMPTY_LOCATIONS: LocationsData = {
  head: "",
  headHash: "",
  branches: [],
  remotes: [],
  tags: [],
  stashes: [],
};

function toStringSet(value: unknown): Set<string> {
  if (value instanceof Set) return new Set([...value].filter((v): v is string => typeof v === "string"));
  if (Array.isArray(value)) return new Set(value.filter((v): v is string => typeof v === "string"));
  return new Set();
}

function isLocationsMessage(msg: IncomingMessage): msg is LegacyLocationsMessage {
  return msg.type === "locations" && typeof (msg as LegacyLocationsMessage).repoPath === "string";
}

function isCommitsMessage(msg: IncomingMessage): msg is LegacyCommitsMessage {
  return msg.type === "commits" && Array.isArray((msg as LegacyCommitsMessage).commits);
}

function isCommitDetailMessage(msg: IncomingMessage): msg is LegacyCommitDetailMessage {
  return msg.type === "commitDetail" && typeof (msg as LegacyCommitDetailMessage).detail === "object";
}

function isPinnedRefsMessage(msg: IncomingMessage): msg is LegacyPinnedRefsMessage {
  return msg.type === "pinnedRefs" && typeof (msg as LegacyPinnedRefsMessage).pinned === "object";
}

function isSubscriptionMessage(msg: IncomingMessage): msg is SubscriptionMessage {
  return msg.type === "subscription";
}

function normalizeMode(mode: string | undefined): FileChange["mode"] {
  const upper = (mode ?? "M").toUpperCase();
  if (upper.includes("??")) return "??";
  if (upper.includes("R")) return "R";
  if (upper.includes("A")) return "A";
  if (upper.includes("D")) return "D";
  return "M";
}

function toDiffHunks(hunks: LegacyDiffHunk[] | undefined): DiffHunk[] {
  if (!hunks) return [];
  return hunks.map((h) => ({
    oldStart: h.oldStart,
    newStart: h.newStart,
    lines: h.lines.map((l) => ({
      type: l.type as "ctx" | "add" | "del" | "hunk",
      ...(typeof l.oldLine === "number" ? { old: l.oldLine } : {}),
      ...(typeof l.newLine === "number" ? { new: l.newLine } : {}),
      text: l.text,
    })),
  }));
}

function buildRawDiff(path: string, hunks: DiffHunk[]): string | undefined {
  if (!hunks.length) return undefined;
  const body: string[] = [];
  for (const h of hunks) {
    for (const line of h.lines) {
      if (line.type === "hunk") body.push(line.text);
      else if (line.type === "add") body.push(`+${line.text}`);
      else if (line.type === "del") body.push(`-${line.text}`);
      else body.push(` ${line.text}`);
    }
  }
  if (!body.length) return undefined;
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${body.join("\n")}\n`;
}

function toFileChange(file: LegacyFile): FileChange {
  const hunks = toDiffHunks(file.hunks?.combined);
  return {
    path: file.path,
    mode: normalizeMode(file.mode),
    added: file.added,
    deleted: file.deleted,
    hunks,
    ...(buildRawDiff(file.path, hunks) ? { rawDiff: buildRawDiff(file.path, hunks) } : {}),
    ...(typeof file.content === "string" ? { content: file.content } : {}),
  };
}

function parseDecorations(refs: string[] | undefined, headBranch: string): Decoration[] {
  if (!refs?.length) return [];
  const out: Decoration[] = [];
  for (const raw of refs) {
    const r = raw.trim();
    if (!r || r === "HEAD") continue;
    if (r.startsWith("HEAD -> ")) {
      out.push({ type: "branch", name: r.slice(8), isHead: true });
      continue;
    }
    if (r.startsWith("tag: ")) {
      out.push({ type: "tag", name: r.slice(5) });
      continue;
    }
    if (r === "refs/stash") {
      out.push({ type: "stash", name: "stash" });
      continue;
    }
    if (r.includes("/")) {
      out.push({ type: "remote", name: r });
      continue;
    }
    out.push({ type: "branch", name: r, ...(r === headBranch ? { isHead: true as const } : {}) });
  }
  return out;
}

export function createWebSocketClient(_url: string): Router & { close(): void } {
  const vscode = acquireVsCodeApi();

  let readySent = false;
  let disposed = false;

  let lastLocations: LegacyLocationsMessage | null = null;
  let lastCommits: LegacyCommitsMessage | null = null;
  let lastDetail: LegacyCommitDetailMessage | null = null;
  let lastPinned: LegacyPinnedRefsMessage | null = null;

  const repoChangedHandlers = new Set<() => void>();
  const repoListChangedHandlers = new Set<() => void>();
  const locationsWaiters: Waiter<LegacyLocationsMessage>[] = [];
  const commitsWaiters: Waiter<LegacyCommitsMessage>[] = [];
  const detailWaiters: Waiter<LegacyCommitDetailMessage>[] = [];
  const pinnedWaiters: Waiter<LegacyPinnedRefsMessage>[] = [];

  function resolveWaiters<T>(waiters: Waiter<T>[], value: T) {
    const pending = [...waiters];
    for (const w of pending) {
      if (w.predicate && !w.predicate(value)) continue;
      clearTimeout(w.timer);
      const idx = waiters.indexOf(w);
      if (idx >= 0) waiters.splice(idx, 1);
      w.resolve(value);
    }
  }

  function waitFor<T>(
    waiters: Waiter<T>[],
    predicate?: (value: T) => boolean,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        const idx = waiters.indexOf(waiter);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error("Timed out waiting for host response"));
      }, timeoutMs);
      const waiter: Waiter<T> = { resolve, reject, predicate, timer };
      waiters.push(waiter);
    });
  }

  function ensureReadyPosted() {
    if (readySent || disposed) return;
    readySent = true;
    vscode.postMessage({ type: "ready" });
  }

  async function ensureData() {
    ensureReadyPosted();
    const waits: Promise<unknown>[] = [];
    if (!lastLocations) waits.push(waitFor(locationsWaiters));
    if (!lastCommits) waits.push(waitFor(commitsWaiters));
    if (waits.length > 0) await Promise.all(waits);
  }

  function toLocationsData(msg: LegacyLocationsMessage | null): LocationsData {
    if (!msg) return EMPTY_LOCATIONS;
    return {
      head: msg.head ?? "",
      headHash: msg.headHash ?? "",
      branches: (msg.branches ?? []).map((b) => ({
        name: b.name,
        hash: b.hash ?? b.commit ?? "",
        ahead: b.ahead ?? 0,
        behind: b.behind ?? 0,
        tracking: b.tracking ?? b.upstream ?? null,
        date: b.date ?? "",
        dateRel: b.dateRel ?? "",
      })),
      remotes: (msg.remotes ?? []).map((r) => {
        const branchRows = Array.isArray(r.branches) ? r.branches : (r.refs ?? []);
        return {
          name: r.name,
          url: r.url ?? "",
          branches: branchRows.map((b) => ({
            name: b.name,
            hash: b.hash ?? b.commit ?? "",
            date: b.date ?? "",
            dateRel: b.dateRel ?? "",
          })),
        };
      }),
      tags: (msg.tags ?? []).map((t) => ({
        name: t.name,
        hash: t.hash ?? t.commit ?? "",
        date: t.date ?? "",
        dateRel: t.dateRel ?? (t.date ?? ""),
      })),
      stashes: (msg.stashes ?? []).map((s) => ({
        index: s.index,
        label: s.label,
        hash: s.hash ?? "",
      })),
    };
  }

  function toCommitEntries(msg: LegacyCommitsMessage | null): CommitEntry[] {
    if (!msg || !lastLocations) return [];
    const head = lastLocations.head ?? "";
    return msg.commits.map((c) => ({
      hash: c.hash,
      parents: c.parents ?? [],
      subject: c.subject,
      author: c.author,
      date: c.date,
      deco: parseDecorations(c.refs, head),
      ...(c.isStash ? { isStash: true as const } : {}),
      ...(c.isUncommitted ? { isUncommitted: true as const } : {}),
      ...(c.isPlaceholder ? { isPlaceholder: true as const } : {}),
    }));
  }

  function toCommitDetail(detailMsg: LegacyCommitDetailMessage): CommitDetail {
    const d = detailMsg.detail;
    const sameCommitter = d.authorName === d.committerName && d.authorEmail === d.committerEmail;
    const workingTree = d.workingTreeChanges
      ? {
          staged: d.workingTreeChanges.staged.map(toFileChange),
          unstaged: d.workingTreeChanges.unstaged.map(toFileChange),
          untracked: d.workingTreeChanges.untracked.map(toFileChange),
        }
      : undefined;
    return {
      hash: d.hash,
      parents: d.parents ?? [],
      author: {
        name: d.authorName,
        email: d.authorEmail,
        date: d.authorDate,
      },
      committer: sameCommitter
        ? null
        : {
            name: d.committerName,
            email: d.committerEmail,
            date: d.committerDate,
          },
      body: d.body ?? "",
      files: (d.files ?? []).map(toFileChange),
      ...(workingTree ? { workingTree } : {}),
    };
  }

  function flattenPinnedRefs(pinned: LegacyPinnedRefs): string[] {
    const refs: string[] = [];
    for (const name of pinned.branches ?? []) refs.push(`branch:${name}`);
    for (const [remote, names] of Object.entries(pinned.remotes ?? {})) {
      for (const name of names) refs.push(`remote:${remote}/${name}`);
    }
    for (const name of pinned.tags ?? []) refs.push(`tag:${name}`);
    return refs;
  }

  function expandPinnedRefs(refs: string[]): LegacyPinnedRefs {
    const out: LegacyPinnedRefs = { branches: [], remotes: {}, tags: [] };
    for (const ref of refs) {
      if (ref.startsWith("branch:")) {
        out.branches.push(ref.slice("branch:".length));
        continue;
      }
      if (ref.startsWith("tag:")) {
        out.tags.push(ref.slice("tag:".length));
        continue;
      }
      if (ref.startsWith("remote:")) {
        const name = ref.slice("remote:".length);
        const slash = name.indexOf("/");
        if (slash > 0) {
          const remote = name.slice(0, slash);
          const branch = name.slice(slash + 1);
          out.remotes[remote] ??= [];
          out.remotes[remote]!.push(branch);
        }
      }
    }
    return out;
  }

  function filtersToHideConfig(filters: unknown) {
    const value = (filters ?? {}) as { hiddenCategories?: unknown; hiddenRefs?: unknown };
    const hiddenCategories = toStringSet(value.hiddenCategories);
    const hiddenRefs = toStringSet(value.hiddenRefs);
    const remoteCategories: Record<string, boolean> = {};
    for (const category of hiddenCategories) {
      if (!category.startsWith("remotes/")) continue;
      const remote = category.slice("remotes/".length).trim();
      if (remote) remoteCategories[remote] = true;
    }
    return {
      categories: {
        branches: hiddenCategories.has("branches"),
        remotes: hiddenCategories.has("remotes"),
        remoteCategories,
        tags: hiddenCategories.has("tags"),
        stashes: hiddenCategories.has("stashes"),
      },
      targets: [...hiddenRefs],
    };
  }

  const onMessage = (event: MessageEvent<IncomingMessage>) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (isLocationsMessage(msg)) {
      lastLocations = msg;
      resolveWaiters(locationsWaiters, msg);
      return;
    }
    if (isCommitsMessage(msg)) {
      lastCommits = msg;
      resolveWaiters(commitsWaiters, msg);
      return;
    }
    if (isCommitDetailMessage(msg)) {
      lastDetail = msg;
      resolveWaiters(detailWaiters, msg);
      return;
    }
    if (isPinnedRefsMessage(msg)) {
      lastPinned = msg;
      resolveWaiters(pinnedWaiters, msg);
      return;
    }
    if (isSubscriptionMessage(msg)) {
      if (msg.event === "repoListChanged") repoListChangedHandlers.forEach((cb) => cb());
      else repoChangedHandlers.forEach((cb) => cb());
    }
  };

  window.addEventListener("message", onMessage);

  const queries: RouterQueries = {
    async getRepos() {
      await ensureData();
      if (!lastLocations) return [];
      const repoPath = lastLocations.repoPath;
      const name = repoPath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? repoPath;
      return [{ id: repoPath, path: repoPath, name }];
    },
    async checkRepo() {
      return null;
    },
    async getLocations() {
      await ensureData();
      return toLocationsData(lastLocations);
    },
    async getCommits(args) {
      await ensureData();
      if (args?.filters) {
        vscode.postMessage({ type: "setHideConfig", hide: filtersToHideConfig(args.filters) });
      }
      const msg = lastCommits ?? (await waitFor(commitsWaiters).catch(() => null));
      return toCommitEntries(msg ?? lastCommits);
    },
    async getCommitDetail({ hash }) {
      ensureReadyPosted();
      vscode.postMessage({ type: "selectCommit", hash });
      const detailMsg = await waitFor(
        detailWaiters,
        (m) =>
          m.detail.hash === hash ||
          m.detail.hash.startsWith(hash) ||
          (hash !== "__uncommitted__" && hash.startsWith(m.detail.hash)),
      ).catch(() => lastDetail);
      if (!detailMsg) throw new Error(`Commit detail not available for ${hash}`);
      return toCommitDetail(detailMsg);
    },
    async getPinnedRefs() {
      ensureReadyPosted();
      const msg = lastPinned ?? (await waitFor(pinnedWaiters).catch(() => null));
      return msg ? flattenPinnedRefs(msg.pinned) : [];
    },
  };

  const mutations: RouterMutations = {
    async action({ action, context }) {
      ensureReadyPosted();
      vscode.postMessage({ type: "action", action, context });
    },
    async setPinnedRefs({ refs }) {
      ensureReadyPosted();
      vscode.postMessage({ type: "setPinnedRefs", pinned: expandPinnedRefs(refs) });
    },
    async focusCommit({ hash }) {
      ensureReadyPosted();
      vscode.postMessage({ type: "focusCommit", hash });
      const msg = await waitFor(
        commitsWaiters,
        (m) =>
          (typeof m.focusHash === "string" && (m.focusHash === hash || m.focusHash.startsWith(hash))) ||
          m.commits.some((c) => c.hash === hash || c.hash.startsWith(hash)),
      ).catch(() => lastCommits);
      return toCommitEntries(msg ?? lastCommits);
    },
  };

  const subscriptions: RouterSubscriptions = {
    onRepoChanged(cb) {
      repoChangedHandlers.add(cb);
      return () => repoChangedHandlers.delete(cb);
    },
    onRepoListChanged(cb) {
      repoListChangedHandlers.add(cb);
      return () => repoListChangedHandlers.delete(cb);
    },
  };

  return {
    queries,
    mutations,
    subscriptions,
    close() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("message", onMessage);
      repoChangedHandlers.clear();
      repoListChangedHandlers.clear();
    },
  };
}
