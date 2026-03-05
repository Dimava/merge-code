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
  RouterQueries,
  RouterMutations,
} from "./plan";

// ── Config ──

const PORT = 3003;
const reposFile = resolve(import.meta.dir, "../../..", ".local/repos.txt");
const defaultRepo = resolve(process.argv[2] || ".");

// ── Git helpers ──

async function git(repo: string, ...args: string[]): Promise<string> {
  const result = await $`git -C ${repo} ${args}`.text();
  return result.trim();
}

async function gitLines(repo: string, ...args: string[]): Promise<string[]> {
  const out = await git(repo, ...args);
  if (!out) return [];
  return out.split("\n");
}

async function gitQuiet(repo: string, ...args: string[]): Promise<string> {
  try {
    return await git(repo, ...args);
  } catch {
    return "";
  }
}

async function gitLinesQuiet(repo: string, ...args: string[]): Promise<string[]> {
  const out = await gitQuiet(repo, ...args);
  if (!out) return [];
  return out.split("\n");
}

// ── Router handlers ──

async function getRepos(): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [
    { id: normalize(defaultRepo), path: defaultRepo, name: basename(defaultRepo) },
  ];
  try {
    const text = await Bun.file(reposFile).text();
    for (const line of text.split("\n")) {
      const p = line.trim();
      if (!p || p.startsWith("#")) continue;
      const resolved = resolve(p);
      if (repos.some((r) => r.id === normalize(resolved))) continue;
      repos.push({ id: normalize(resolved), path: resolved, name: basename(resolved) });
    }
  } catch {}
  return repos;
}

async function getLocations(repo: string): Promise<LocationsData> {
  const [head, branches, remotes, tags, stashes] = await Promise.all([
    gitQuiet(repo, "rev-parse", "--abbrev-ref", "HEAD"),
    loadBranches(repo),
    loadRemotes(repo),
    loadTags(repo),
    loadStashes(repo),
  ]);
  return { head: head || "(detached)", branches, remotes, tags, stashes };
}

async function loadBranches(repo: string): Promise<Branch[]> {
  const lines = await gitLinesQuiet(
    repo,
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

async function loadRemotes(repo: string): Promise<RemoteGroup[]> {
  const remoteNames = await gitLinesQuiet(repo, "remote");
  return Promise.all(
    remoteNames.map(async (name) => {
      const url = await gitQuiet(repo, "remote", "get-url", name);
      const refLines = await gitLinesQuiet(
        repo,
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

async function loadTags(repo: string): Promise<Tag[]> {
  const lines = await gitLinesQuiet(
    repo,
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

async function loadStashes(repo: string): Promise<Stash[]> {
  const lines = await gitLinesQuiet(repo, "stash", "list", "--format=%gs");
  return lines.map((label, index) => ({ index, label }));
}

async function getCommits(repo: string, _filters?: Filters): Promise<CommitEntry[]> {
  // TODO: apply filters (hidden categories, hidden refs, expanded merges)
  const excludeArgs: string[] = [];

  const stashEntries = await gitLinesQuiet(repo, "stash", "list", "--format=%H\t%gd");
  const stashHashes = stashEntries.map((l) => l.split("\t")[0]!).filter(Boolean);
  const stashSet = new Set(stashHashes);

  const [statusOut, headHash] = await Promise.all([
    gitQuiet(repo, "status", "--porcelain"),
    gitQuiet(repo, "rev-parse", "HEAD"),
  ]);

  const lines = await gitLines(
    repo,
    "log",
    ...excludeArgs,
    "--all",
    ...stashHashes,
    "--topo-order",
    "--format=%H\t%P\t%s\t%an\t%ar\t%D",
    "--max-count=200",
  );

  const head = await gitQuiet(repo, "rev-parse", "--abbrev-ref", "HEAD");
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

  return stashInternals.size > 0 ? commits.filter((c) => !stashInternals.has(c.hash)) : commits;
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

async function getCommitDetail(repo: string, hash: string): Promise<CommitDetail> {
  if (hash === "__uncommitted__") {
    return getUncommittedDetail(repo);
  }

  const [info, diffStat, diffRaw, nameStatusRaw] = await Promise.all([
    git(repo, "show", "--no-patch", "--format=%H\t%P\t%an\t%ae\t%aI\t%cn\t%ce\t%cI\t%B", hash),
    git(repo, "diff-tree", "--no-commit-id", "-r", "--numstat", "-m", "--first-parent", hash),
    git(repo, "diff-tree", "--no-commit-id", "-p", "-U3", "-m", "--first-parent", hash),
    git(repo, "diff-tree", "--no-commit-id", "-r", "--name-status", "-m", "--first-parent", hash),
  ]);

  const parts = info.split("\t");
  const authorName = parts[2]!;
  const authorEmail = parts[3]!;
  const authorDate = parts[4]!;
  const committerName = parts[5]!;
  const committerEmail = parts[6]!;
  const committerDate = parts[7]!;
  const body = parts.slice(8).join("\t").trim();

  const sameCommitter = authorName === committerName && authorEmail === committerEmail;

  const statFiles = parseNumstat(diffStat);
  const modes = parseNameStatus(nameStatusRaw);
  const diffs = parseDiff(diffRaw);
  const files: FileChange[] = statFiles.map((f) => ({
    ...f,
    mode: fileMode(modes.get(f.path)),
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

async function getUncommittedDetail(repo: string): Promise<CommitDetail> {
  const [headHash, diffStat, diffRaw, statusOut] = await Promise.all([
    gitQuiet(repo, "rev-parse", "HEAD"),
    gitQuiet(repo, "diff", "--numstat", "HEAD"),
    gitQuiet(repo, "diff", "-U3", "HEAD"),
    gitQuiet(repo, "status", "--porcelain"),
  ]);

  const [stagedStat, unstagedStat, stagedRaw, unstagedRaw] = await Promise.all([
    gitQuiet(repo, "diff", "--cached", "--numstat"),
    gitQuiet(repo, "diff", "--numstat"),
    gitQuiet(repo, "diff", "--cached", "-U3"),
    gitQuiet(repo, "diff", "-U3"),
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
    mode: fileMode(modes.get(f.path)),
    hunks: diffs[f.path] ?? [],
  }));

  const stagedFiles: FileChange[] = parseNumstat(stagedStat).map((f) => ({
    ...f,
    mode: fileMode(modes.get(f.path)),
    hunks: parseDiff(stagedRaw)[f.path] ?? [],
  }));

  const unstagedFiles: FileChange[] = parseNumstat(unstagedStat).map((f) => ({
    ...f,
    mode: fileMode(modes.get(f.path)),
    hunks: parseDiff(unstagedRaw)[f.path] ?? [],
  }));

  const untrackedFiles: FileChange[] = untrackedPaths.map((p) => ({
    path: p,
    mode: fileMode("??"),
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

function fileMode(raw: string | undefined): FileChange["mode"] {
  const m = raw ?? "M";
  if (m === "M" || m === "A" || m === "D" || m === "R" || m === "??") return m;
  return "M";
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

// Derive handler map type from router interfaces — no `as` casts needed.
type RouterMethods = RouterQueries & RouterMutations;
type HandlerOf<K extends keyof RouterMethods> = RouterMethods[K] extends (
  args: infer A,
) => infer R
  ? (params: A) => R
  : RouterMethods[K] extends () => infer R
    ? (params?: undefined) => R
    : never;
type RouterHandlers = { [K in keyof RouterMethods]: HandlerOf<K> };

const handlers: RouterHandlers = {
  getRepos: () => getRepos(),
  getLocations: ({ repo }) => getLocations(repo),
  getCommits: ({ repo, filters }) => getCommits(repo, filters),
  getCommitDetail: ({ repo, hash }) => getCommitDetail(repo, hash),
  getPinnedRefs: async () => [],
  action: async () => {},
  setPinnedRefs: async () => {},
  focusCommit: ({ repo }) => getCommits(repo), // TODO: windowed
};

// ── Server ──

const clients = new Set<{ send(msg: string): void }>();

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
      clients.add(ws);
    },
    close(ws) {
      clients.delete(ws);
    },
    async message(ws, raw) {
      const msg: RpcRequest = JSON.parse(String(raw));
      const response: RpcResponse = { id: msg.id };
      if (!(msg.method in handlers)) {
        response.error = `Unknown method: ${msg.method}`;
      } else {
        try {
          // Dynamic dispatch boundary: method is validated above, params are typed by caller
          const fn: Function = handlers[msg.method as keyof RouterHandlers];
          response.result = await fn(msg.params);
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
console.log(`repo: ${defaultRepo}`);
