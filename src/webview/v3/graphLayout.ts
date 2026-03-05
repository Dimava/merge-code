import type { CommitEntry, GraphRow, Edge } from "./plan";

const PALETTE = [
  "#6bc5f8",
  "#e78a4e",
  "#a9dc76",
  "#fc6d7b",
  "#ab9df2",
  "#ffd866",
  "#78dce8",
  "#ff6188",
];

export function laneColor(col: number): string {
  return PALETTE[col % PALETTE.length]!;
}

export function layoutGraph(commits: CommitEntry[]): { rows: GraphRow[]; width: number } {
  if (commits.length === 0) return { rows: [], width: 0 };

  const idx = new Map<string, number>();
  for (let i = 0; i < commits.length; i++) idx.set(commits[i]!.hash, i);

  // --- Phase 1: trace first-parent chains, assign lanes via interval occupancy ---

  const col = new Int32Array(commits.length);
  const visited = new Set<string>();

  // occupancy[lane] = list of [from, to) intervals
  const occupancy: [number, number][][] = [];

  function isFree(lane: number, from: number, to: number) {
    const iv = occupancy[lane];
    if (!iv) return true;
    for (const [a, b] of iv) if (from < b && to > a) return false;
    return true;
  }

  function occupy(lane: number, from: number, to: number) {
    (occupancy[lane] ??= []).push([from, to]);
  }

  function firstFree(from: number, to: number, startAt = 0) {
    for (let l = startAt; ; l++) if (isFree(l, from, to)) return l;
  }

  for (let si = 0; si < commits.length; si++) {
    if (visited.has(commits[si]!.hash)) continue;

    const chain: number[] = [];
    let cur: number | undefined = si;
    while (cur !== undefined && !visited.has(commits[cur]!.hash)) {
      chain.push(cur);
      visited.add(commits[cur]!.hash);
      if (commits[cur]!.isStash) break;
      const p0 = commits[cur]!.parents[0];
      cur = p0 !== undefined ? idx.get(p0) : undefined;
    }
    if (chain.length === 0) continue;

    const fromRow = chain[0]!;
    const lastRow = chain[chain.length - 1]!;
    // extend occupancy to first-parent target so connectors don't collide
    let toRow = lastRow + 1;
    const tailParent = commits[lastRow]!.parents[0];
    if (tailParent !== undefined) {
      const tp = idx.get(tailParent);
      if (tp !== undefined) toRow = Math.max(toRow, tp + 1);
    }

    const lane = commits[si]!.isStash ? firstFree(fromRow, toRow, 1) : firstFree(fromRow, toRow);

    occupy(lane, fromRow, toRow);
    for (const i of chain) col[i] = lane;
  }

  // --- Phase 2: build GraphRow[] ---

  const children: number[][] = Array.from({ length: commits.length }, () => []);
  for (let i = 0; i < commits.length; i++) {
    const parents = commits[i]!.isStash ? commits[i]!.parents.slice(0, 1) : commits[i]!.parents;
    for (const ph of parents) {
      const pi = idx.get(ph);
      if (pi !== undefined) children[pi]!.push(i);
    }
  }

  function activeAt(row: number): number[] {
    const lanes: number[] = [];
    for (let l = 0; l < occupancy.length; l++) {
      const iv = occupancy[l];
      if (!iv) continue;
      for (const [a, b] of iv) {
        if (row >= a && row < b) {
          lanes.push(l);
          break;
        }
      }
    }
    return lanes;
  }

  let width = 0;
  const rows: GraphRow[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]!;
    const c = col[i]!;
    const parents = commit.isStash ? commit.parents.slice(0, 1) : commit.parents;

    const parentIndices = parents.map((ph) => idx.get(ph) ?? -1);
    const edges: Edge[] = parentIndices.map((pi) => ({
      parentIndex: pi,
      fromCol: c,
      toCol: pi !== -1 ? col[pi]! : c,
      color: laneColor(pi !== -1 ? col[pi]! : c),
    }));

    const active = activeAt(i);
    const passThrough = active.filter((l) => l !== c);
    const w = active.length > 0 ? Math.max(...active) + 1 : c + 1;
    if (w > width) width = w;

    rows.push({
      index: i,
      commit,
      col: c,
      width: w,
      parentIndices,
      childIndices: children[i]!,
      isVisibleRoot: parentIndices.every((pi) => pi === -1),
      isVisibleHead: children[i]!.length === 0,
      edges,
      passThrough,
    });
  }

  return { rows, width };
}
