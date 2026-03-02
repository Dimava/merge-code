import type { CommitEntry } from "./types";

export interface LaneCell {
  type: "empty" | "commit" | "pass";
  color: string;
  linesUp: number[];
  linesDown: number[];
}

export interface GraphRow {
  commit: CommitEntry;
  col: number;
  lanes: LaneCell[];
  isMerge: boolean;
  isStash: boolean;
  isUncommitted: boolean;
  isRoot: boolean;
}

const COLORS = [
  "#6bc5f8",
  "#e78a4e",
  "#a9dc76",
  "#fc6d7b",
  "#ab9df2",
  "#ffd866",
  "#78dce8",
  "#ff6188",
  "#a6e22e",
  "#ae81ff",
  "#f4bf75",
  "#66d9ef",
  "#e06c75",
  "#98c379",
  "#c678dd",
];

export function pickColor(col: number): string {
  return COLORS[col % COLORS.length]!;
}

// An interval a branch occupies: rows [fromRow, toRow), in lane `lane`.
interface BranchSpan {
  hashes: Set<string>;
  lane: number;
  fromRow: number;
  toRow: number;
}

export function computeGraphRows(commits: CommitEntry[]): GraphRow[] {
  if (commits.length === 0) return [];

  const indexByHash = new Map<string, number>();
  for (let i = 0; i < commits.length; i++) {
    indexByHash.set(commits[i]!.hash, i);
  }

  // --- Phase 1: Trace first-parent chains and assign lanes ---

  const assignedLane = new Map<string, number>();
  const spans: BranchSpan[] = [];

  // Occupancy: for each lane, list of [fromRow, toRow) intervals
  const laneOccupancy: [number, number][][] = [];

  function laneIsFree(lane: number, from: number, to: number): boolean {
    const intervals = laneOccupancy[lane];
    if (!intervals) return true;
    for (const [a, b] of intervals) {
      if (from < b && to > a) return false;
    }
    return true;
  }

  function occupyLane(lane: number, from: number, to: number) {
    if (!laneOccupancy[lane]) laneOccupancy[lane] = [];
    laneOccupancy[lane]!.push([from, to]);
  }

  function firstFreeLane(from: number, to: number): number {
    for (let l = 0; ; l++) {
      if (laneIsFree(l, from, to)) return l;
    }
  }

	function stashLane(from: number, to: number): number {
		// Stashes prefer lane 1 (just right of the trunk), then 2, 3, ...
		for (let l = 1; ; l++) {
			if (laneIsFree(l, from, to)) return l;
		}
	}

  // Walk first-parent chains starting from unvisited commits (in topo order).
  // HEAD chain goes first (index 0), so it gets lane 0.
  const visited = new Set<string>();

  for (let startIdx = 0; startIdx < commits.length; startIdx++) {
    const startCommit = commits[startIdx]!;
    if (visited.has(startCommit.hash)) continue;

    // Trace the first-parent chain from startCommit until we hit
    // an already-visited commit or run out of parents.
    const chain: string[] = [];
    let cur: CommitEntry | undefined = startCommit;
    while (cur && !visited.has(cur.hash)) {
      chain.push(cur.hash);
      visited.add(cur.hash);
      if (cur.isStash) break;
      const p0 = cur.parents[0];
      cur = p0 !== undefined ? commits[indexByHash.get(p0) ?? -1] : undefined;
    }

    if (chain.length === 0) continue;

    const fromRow = startIdx;
    const lastHash = chain[chain.length - 1]!;
    const lastIdx = indexByHash.get(lastHash)!;
    const toRow = lastIdx + 1;

		const isStashChain = startCommit.isStash ?? false;
		let lane: number;
		if (isStashChain) {
			lane = stashLane(fromRow, toRow);
		} else {
			lane = firstFreeLane(fromRow, toRow);
		}

    occupyLane(lane, fromRow, toRow);
    const hashes = new Set(chain);
    spans.push({ hashes, lane, fromRow, toRow });
    for (const h of chain) {
      assignedLane.set(h, lane);
    }
  }

  // --- Phase 2: Build GraphRow array with lane cells and edges ---

  // For each row, figure out which lanes are active (have a span covering that row).
  const rows: GraphRow[] = [];

  for (let ri = 0; ri < commits.length; ri++) {
    const commit = commits[ri]!;
    const isMerge = commit.parents.length > 1;
    const isStash = commit.isStash ?? false;
    const isUncommitted = commit.isUncommitted ?? false;
    const col = assignedLane.get(commit.hash) ?? 0;

    // Determine max lane used at this row
    let maxLane = col;
    for (const span of spans) {
      if (ri >= span.fromRow && ri < span.toRow && span.lane > maxLane) {
        maxLane = span.lane;
      }
    }
    // Also check merge parents that might be in higher lanes
    const parentCount = isStash ? Math.min(commit.parents.length, 1) : commit.parents.length;
    for (let pi = 0; pi < parentCount; pi++) {
      const pLane = assignedLane.get(commit.parents[pi]!);
      if (pLane !== undefined && pLane > maxLane) maxLane = pLane;
    }

    const laneCount = maxLane + 1;
    const lanes: LaneCell[] = [];

    // Build cells
    for (let l = 0; l < laneCount; l++) {
      let isActive = false;
      for (const span of spans) {
        if (span.lane === l && ri >= span.fromRow && ri < span.toRow) {
          isActive = true;
          break;
        }
      }
      const isCommitLane = l === col;

		// linesUp: same span must cover both this row and the row above
		const hasUp = isCommitLane
			? sameSpanCovers(l, ri, ri - 1)
			: sameSpanCovers(l, ri, ri - 1);

      lanes.push({
        type: isCommitLane ? "commit" : isActive ? "pass" : "empty",
        color: pickColor(l),
        linesUp: hasUp ? [l] : [],
        linesDown: [],
      });
    }

    // linesDown from the commit's lane
    if (parentCount > 0) {
      const p0Lane = assignedLane.get(commit.parents[0]!);
      if (p0Lane !== undefined) {
        lanes[col]!.linesDown.push(p0Lane);
      }
    }

    for (let pi = 1; pi < parentCount; pi++) {
      const pLane = assignedLane.get(commit.parents[pi]!);
      if (pLane !== undefined) {
        lanes[col]!.linesDown.push(pLane);
      }
    }

	// Passthrough linesDown: only if same span continues to next row
		for (let l = 0; l < laneCount; l++) {
			if (l === col) continue;
			if (lanes[l]!.type === "pass" && sameSpanCovers(l, ri, ri + 1)) {
				if (!lanes[l]!.linesDown.includes(l)) {
					lanes[l]!.linesDown.push(l);
				}
			}
		}

    const isRoot = !isUncommitted && lanes[col]!.linesDown.length === 0;
    rows.push({ commit, col, lanes, isMerge, isStash, isUncommitted, isRoot });
  }

	function spanAt(lane: number, row: number): BranchSpan | undefined {
		if (row < 0) return undefined;
		for (const span of spans) {
			if (span.lane === lane && row >= span.fromRow && row < span.toRow) {
				return span;
			}
		}
		return undefined;
	}

	function isLaneActiveAt(lane: number, row: number): boolean {
		return spanAt(lane, row) !== undefined;
	}

	function sameSpanCovers(lane: number, rowA: number, rowB: number): boolean {
		const s = spanAt(lane, rowA);
		return s !== undefined && rowB >= s.fromRow && rowB < s.toRow;
	}

  return rows;
}

export function computeGraphWidth(rows: GraphRow[], colW: number): number {
  let max = 1;
  for (const row of rows) {
    if (row.lanes.length > max) max = row.lanes.length;
  }
  return max * colW + 8;
}
