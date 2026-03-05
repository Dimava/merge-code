import { resolve, join, normalize, basename } from "node:path";
import { $ } from "bun";
import { watch } from "node:fs";
import homepage from "./index.html";
import type {
  RepoInfo,
  LocationsData,
  Branch,
  RemoteGroup,
  Tag,
  Stash,
  CommitEntry,
  CommitDetail,
  Decoration,
  FileChange,
  DiffHunk,
  Filters,
} from "./plan";

// ── Config ──

const PORT = 3003;
const repoPath = resolve(process.argv[2] || ".");

// ── Git helpers ──

async function git(...args: string[]): Promise<string> {
  const result = await $`git -C ${repoPath} ${args}`.text();
  return result.trim();
}

async function gitLines(...args: string[]): Promise<string[]> {
  const out = await git(...args);
  if (!out) return [];
  return out.split("\n");
}

async function gitQuiet(...args: string[]): Promise<string> {
  try {
    return await git(...args);
  } catch {
    return "";
  }
}

async function gitLinesQuiet(...args: string[]): Promise<string[]> {
  const out = await gitQuiet(...args);
  if (!out) return [];
  return out.split("\n");
}

// ── Router handlers ──

async function getRepos(): Promise<RepoInfo[]> {
  const id = normalize(repoPath);
  return [{ id, path: repoPath, name: basename(repoPath) }];
}

async function getLocations(): Promise<LocationsData> {
  const [head, branches, remotes, tags, stashes] = await Promise.all([
    gitQuiet("rev-parse", "--abbrev-ref", "HEAD"),
    loadBranches(),
    loadRemotes(),
    loadTags(),
    loadStashes(),
  ]);
  return { head: head || "(detached)", branches, remotes, tags, stashes };
}

async function loadBranches(): Promise<Branch[]> {
  const lines = await gitLinesQuiet(
    "for-each-ref",
    "--format=%(refname:short)\t%(upstream:short)\t%(upstream:track,nobracket)\t%(objectname:short)",
    "refs/heads/",
  );
  return lines.map((line) => {
    const [name, upstream, track] = line.split("\t");
    let ahead = 0;
    let behind = 0;
    if (track) {
      const a = track.match(/ahead (\d+)/);
      const b = track.match(/behind (\d+)/);
      if (a) ahead = Number(a[1]);
      if (b) behind = Number(b[1]);
    }
    return { name: name!, ahead, behind, tracking: upstream || null };
  });
}

async function loadRemotes(): Promise<RemoteGroup[]> {
  const remoteNames = await gitLinesQuiet("remote");
  return Promise.all(
    remoteNames.map(async (name) => {
      const url = await gitQuiet("remote", "get-url", name);
      const refLines = await gitLinesQuiet(
        "for-each-ref",
        "--format=%(refname:short)",
        `refs/remotes/${name}/`,
      );
      const branches = refLines
        .filter((l) => !l.includes("/HEAD"))
        .map((l) => l.replace(`${name}/`, ""));
      return { name, url, branches };
    }),
  );
}

async function loadTags(): Promise<Tag[]> {
  const lines = await gitLinesQuiet(
    "for-each-ref",
    "--format=%(refname:short)\t%(creatordate:relative)",
    "--sort=-creatordate",
    "refs/tags/",
  );
  return lines.map((l) => {
    const [name, date] = l.split("\t");
    return { name: name!, date: date ?? "" };
  });
}

async function loadStashes(): Promise<Stash[]> {
  const lines = await gitLinesQuiet("stash", "list", "--format=%gs");
  return lines.map((label, index) => ({ index, label }));
}

async function getCommits(_filters?: Filters): Promise<CommitEntry[]> {
  // TODO: apply filters (hidden categories, hidden refs, expanded merges)
  const excludeArgs: string[] = [];

  const stashEntries = await gitLinesQuiet("stash", "list", "--format=%H\t%gd");
  const stashHashes = stashEntries.map((l) => l.split("\t")[0]!).filter(Boolean);
  const stashSet = new Set(stashHashes);

  const [statusOut, headHash] = await Promise.all([
    gitQuiet("status", "--porcelain"),
    gitQuiet("rev-parse", "HEAD"),
  ]);

  const lines = await gitLines(
    "log",
    ...excludeArgs,
    "--all",
    ...stashHashes,
    "--topo-order",
    "--format=%H\t%P\t%s\t%an\t%ar\t%D",
    "--max-count=200",
  );

  const head = await gitQuiet("rev-parse", "--abbrev-ref", "HEAD");
  const commits: CommitEntry[] = [];

  // Uncommitted entry
  const statusLines = statusOut.split("\n").filter((l) => l.length > 0);
  if (statusLines.length > 0 && headHash) {
    const staged = statusLines.filter((l) => !l.startsWith("?? ") && l[0] !== " ").length;
    const untracked = statusLines.filter((l) => l.startsWith("?? ")).length;
    const unstaged =
      statusLines.filter((l) => !l.startsWith("?? ") && l[1] !== " ").length + untracked;
    commits.push({
      hash: "__uncommitted__",
      parents: [headHash],
      subject: `${staged} staged, ${unstaged} unstaged`,
      author: "Working tree",
      date: "",
      deco: [],
      isUncommitted: true,
    });
  }

  for (const l of lines) {
    const [hash, parents, subject, author, date, refsRaw] = l.split("\t");
    const deco = parseDecorations(refsRaw ?? "", head);
    commits.push({
      hash: hash!,
      parents: parents ? parents.split(" ").filter((p) => p.length > 0) : [],
      subject: subject!,
      author: author!,
      date: date!,
      deco,
      isStash: stashSet.has(hash!) || undefined,
    });
  }

  // Filter stash internals
  const stashInternals = new Set<string>();
  for (const c of commits) {
    if (c.isStash) {
      for (let i = 1; i < c.parents.length; i++) {
        stashInternals.add(c.parents[i]!);
      }
    }
  }

  return stashInternals.size > 0
    ? commits.filter((c) => !stashInternals.has(c.hash))
    : commits;
}

function parseDecorations(refsRaw: string, headBranch: string): Decoration[] {
  if (!refsRaw) return [];
  const deco: Decoration[] = [];
  for (const ref of refsRaw.split(", ")) {
    const r = ref.trim();
    if (!r || r === "HEAD") continue;
    if (r.startsWith("HEAD -> ")) {
      deco.push({ type: "branch", name: r.slice(8), isHead: true });
    } else if (r.startsWith("tag: ")) {
      deco.push({ type: "tag", name: r.slice(5) });
    } else if (r.includes("/")) {
      deco.push({ type: "remote", name: r });
    } else {
      deco.push({
        type: "branch",
        name: r,
        ...(r === headBranch ? { isHead: true as const } : {}),
      });
    }
  }
  return deco;
}

async function getCommitDetail(hash: string): Promise<CommitDetail> {
  if (hash === "__uncommitted__") {
    return getUncommittedDetail();
  }

  const [info, diffStat, diffRaw, nameStatusRaw] = await Promise.all([
    git("show", "--no-patch", "--format=%H\t%P\t%an\t%ae\t%aI\t%cn\t%ce\t%cI\t%B", hash),
    git("diff-tree", "--no-commit-id", "-r", "--numstat", "-m", "--first-parent", hash),
    git("diff-tree", "--no-commit-id", "-p", "-U3", "-m", "--first-parent", hash),
    git("diff-tree", "--no-commit-id", "-r", "--name-status", "-m", "--first-parent", hash),
  ]);

  const parts = info.split("\t");
  const authorName = parts[2]!;
  const authorEmail = parts[3]!;
  const authorDate = parts[4]!;
  const committerName = parts[5]!;
  const committerEmail = parts[6]!;
  const committerDate = parts[7]!;
  const body = parts.slice(8).join("\t").trim();

  const sameCommitter =
    authorName === committerName && authorEmail === committerEmail;

  const statFiles = parseNumstat(diffStat);
  const modes = parseNameStatus(nameStatusRaw);
  const diffs = parseDiff(diffRaw);
  const files: FileChange[] = statFiles.map((f) => ({
    ...f,
    mode: (modes.get(f.path) ?? "M") as FileChange["mode"],
    hunks: diffs[f.path] ?? [],
  }));

  return {
    hash: parts[0]!,
    parents: parts[1] ? parts[1].split(" ").filter(Boolean) : [],
    author: { name: authorName, email: authorEmail, date: authorDate },
    committer: sameCommitter
      ? null
      : { name: committerName, email: committerEmail, date: committerDate },
    body,
    files,
  };
}

async function getUncommittedDetail(): Promise<CommitDetail> {
  const [headHash, diffStat, diffRaw, statusOut] = await Promise.all([
    gitQuiet("rev-parse", "HEAD"),
    gitQuiet("diff", "--numstat", "HEAD"),
    gitQuiet("diff", "-U3", "HEAD"),
    gitQuiet("status", "--porcelain"),
  ]);

  const [stagedStat, unstagedStat, stagedRaw, unstagedRaw] = await Promise.all([
    gitQuiet("diff", "--cached", "--numstat"),
    gitQuiet("diff", "--numstat"),
    gitQuiet("diff", "--cached", "-U3"),
    gitQuiet("diff", "-U3"),
  ]);

  const files = parseNumstat(diffStat);
  const modes = parsePorcelainModes(statusOut);
  const diffs = parseDiff(diffRaw);

  const untrackedPaths = statusOut
    .split("\n")
    .filter((l) => l.startsWith("?? "))
    .map((l) => l.slice(3).trim())
    .filter(Boolean);

  const existing = new Set(files.map((f) => f.path));
  for (const p of untrackedPaths) {
    if (!existing.has(p)) files.push({ path: p, added: 0, deleted: 0 });
  }

  const detailedFiles: FileChange[] = files.map((f) => ({
    ...f,
    mode: (modes.get(f.path) ?? "M") as FileChange["mode"],
    hunks: diffs[f.path] ?? [],
  }));

  const stagedFiles: FileChange[] = parseNumstat(stagedStat).map((f) => ({
    ...f,
    mode: (modes.get(f.path) ?? "M") as FileChange["mode"],
    hunks: parseDiff(stagedRaw)[f.path] ?? [],
  }));

  const unstagedFiles: FileChange[] = parseNumstat(unstagedStat).map((f) => ({
    ...f,
    mode: (modes.get(f.path) ?? "M") as FileChange["mode"],
    hunks: parseDiff(unstagedRaw)[f.path] ?? [],
  }));

  const untrackedFiles: FileChange[] = untrackedPaths.map((p) => ({
    path: p,
    mode: "??" as const,
    added: 0,
    deleted: 0,
    hunks: [],
  }));

  const now = new Date().toISOString();

  return {
    hash: "__uncommitted__",
    parents: headHash ? [headHash] : [],
    author: { name: "Working tree", email: "", date: now },
    committer: null,
    body: "Uncommitted changes",
    files: detailedFiles,
    workingTree: {
      staged: stagedFiles,
      unstaged: unstagedFiles,
      untracked: untrackedFiles,
    },
  };
}

// ── Parsers ──

function parseNumstat(raw: string): { path: string; added: number; deleted: number }[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [added, deleted, ...pathParts] = l.split("\t");
      return {
        path: pathParts.at(-1) ?? "",
        added: added === "-" ? -1 : Number(added),
        deleted: deleted === "-" ? -1 : Number(deleted),
      };
    })
    .filter((f) => f.path.length > 0);
}

function parseNameStatus(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw) return result;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    result.set(parts.at(-1)!, parts[0]!);
  }
  return result;
}

function parsePorcelainModes(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw) return result;
  for (const line of raw.split("\n")) {
    if (line.length < 4) continue;
    const x = line[0] ?? " ";
    const y = line[1] ?? " ";
    const pathRaw = line.slice(3).trim();
    if (!pathRaw) continue;
    const path = pathRaw.includes(" -> ") ? pathRaw.split(" -> ").at(-1)! : pathRaw;
    if (x === "?" && y === "?") {
      result.set(path, "??");
    } else {
      const sx = x.trim();
      const sy = y.trim();
      result.set(path, sx || sy || "M");
    }
  }
  return result;
}

function parseDiff(raw: string): Record<string, DiffHunk[]> {
  if (!raw) return {};
  const result: Record<string, DiffHunk[]> = {};
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split("\n");
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;
    const filePath = headerMatch[2]!;
    const hunks: DiffHunk[] = [];
    let current: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        current = { oldStart: Number(hunkMatch[1]), newStart: Number(hunkMatch[2]), lines: [] };
        oldLine = current.oldStart;
        newLine = current.newStart;
        hunks.push(current);
        current.lines.push({ type: "hunk", text: line });
        continue;
      }
      if (!current) continue;

      if (line.startsWith("+")) {
        current.lines.push({ type: "add", new: newLine, text: line.slice(1) });
        newLine++;
      } else if (line.startsWith("-")) {
        current.lines.push({ type: "del", old: oldLine, text: line.slice(1) });
        oldLine++;
      } else if (line.startsWith(" ")) {
        current.lines.push({ type: "ctx", old: oldLine, new: newLine, text: line.slice(1) });
        oldLine++;
        newLine++;
      }
    }
    result[filePath] = hunks;
  }
  return result;
}

// ── WebSocket RPC dispatch ──

type RpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type RpcResponse = {
  id: number;
  result?: unknown;
  error?: string;
};

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
  getRepos: () => getRepos(),
  getLocations: () => getLocations(),
  getCommits: (p) => {
    const { filters } = (p ?? {}) as { filters?: Filters };
    return getCommits(filters);
  },
  getCommitDetail: (p) => {
    const { hash } = p as { hash: string };
    return getCommitDetail(hash);
  },
  getPinnedRefs: async () => [],
  switchRepo: async () => {},
  action: async () => {},
  setPinnedRefs: async () => {},
  focusCommit: () => getCommits(), // TODO: windowed
};

// ── Server ──

type WS = { send(msg: string): void };
const clients = new Set<WS>();

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": homepage,
  },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws as unknown as WS);
    },
    close(ws) {
      clients.delete(ws as unknown as WS);
    },
    async message(ws, raw) {
      const msg = JSON.parse(String(raw)) as RpcRequest;
      const handler = handlers[msg.method];

      const response: RpcResponse = { id: msg.id };
      if (!handler) {
        response.error = `Unknown method: ${msg.method}`;
      } else {
        try {
          response.result = await handler(msg.params);
        } catch (err) {
          response.error = err instanceof Error ? err.message : String(err);
        }
      }

      ws.send(JSON.stringify(response));
    },
  },
  development: true,
});

// ── Watch .git for changes ──

function broadcast(event: string) {
  const msg = JSON.stringify({ type: "subscription", event });
  for (const ws of clients) ws.send(msg);
}

try {
  const gitDir = join(repoPath, ".git");
  watch(gitDir, { recursive: false }, (_event, filename) => {
    if (!filename) return;
    if (["HEAD", "index", "FETCH_HEAD", "ORIG_HEAD"].includes(filename) || filename === "refs") {
      broadcast("repoChanged");
    }
  });

  watch(join(gitDir, "refs"), { recursive: true }, () => {
    broadcast("repoChanged");
  });
} catch {
  console.warn("Could not watch .git directory");
}

console.log(`merge-code v3 dev server → http://localhost:${PORT}`);
console.log(`repo: ${repoPath}`);
