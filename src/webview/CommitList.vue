<script setup lang="ts">
import { computed, watch, nextTick, ref as vueRef } from "vue";

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

interface GraphRow {
  commit: CommitEntry;
  col: number;
  lanes: LaneCell[];
  isMerge: boolean;
  isStash: boolean;
  isUncommitted: boolean;
}

interface LaneCell {
  type: "empty" | "commit" | "pass";
  color: string;
  linesUp: number[];
  linesDown: number[];
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

function pickColor(col: number): string {
  return COLORS[col % COLORS.length]!;
}

const props = defineProps<{
  commits: CommitEntry[];
  selected?: string;
  focusHash?: string;
  head?: string;
}>();

const emit = defineEmits<{
  select: [hash: string];
}>();

const scrollContainer = vueRef<HTMLElement>();

const ROW_H = 40;
const COL_W = 12;
const DOT_R = 4;
const LINE_W = 1.5;

function emitDiag(message: string, data?: unknown, level: "info" | "warn" | "error" = "info") {
  window.dispatchEvent(
    new CustomEvent("mergeCode:webviewLog", {
      detail: { source: "commit-list", message, data, level },
    }),
  );
}

watch(
  () => props.focusHash,
  async (hash) => {
    if (!hash) return;
    await nextTick();
    const el = scrollContainer.value?.querySelector(`[data-hash="${hash}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  },
);

// See docs/graph-layout-rules.md for the full set of rules.
const graphRows = computed(() => {
  const commits = props.commits;
  const rows: GraphRow[] = [];
  const activeLanes: (string | null)[] = [];

  function findLane(hash: string): number {
    return activeLanes.indexOf(hash);
  }

  function firstFreeOrAppend(): number {
    const idx = activeLanes.indexOf(null);
    if (idx >= 0) return idx;
    activeLanes.push(null);
    return activeLanes.length - 1;
  }

  function rightmostFreeOrAppend(): number {
    for (let i = activeLanes.length - 1; i >= 0; i--) {
      if (activeLanes[i] === null) return i;
    }
    activeLanes.push(null);
    return activeLanes.length - 1;
  }

  for (const commit of commits) {
    const isMerge = commit.parents.length > 1;
    const isStash = commit.isStash ?? false;
    const isUncommitted = commit.isUncommitted ?? false;
    let col = findLane(commit.hash);
    const wasTracked = col >= 0;

    if (col < 0) {
      col = isStash ? rightmostFreeOrAppend() : firstFreeOrAppend();
      activeLanes[col] = commit.hash;
    }

    const laneCount = Math.max(activeLanes.length, col + 1);
    const lanes: LaneCell[] = [];
    for (let i = 0; i < laneCount; i++) {
      const hasLineUp = i === col ? wasTracked : activeLanes[i] != null;
      lanes.push({
        type: i === col ? "commit" : activeLanes[i] != null ? "pass" : "empty",
        color: pickColor(i),
        linesUp: hasLineUp ? [i] : [],
        linesDown: [],
      });
    }

    activeLanes[col] = null;

    const parentCount = isStash ? Math.min(commit.parents.length, 1) : commit.parents.length;

    // First parent continues straight down in the same lane
    if (parentCount > 0) {
      const p0 = commit.parents[0]!;
      const existingLane = findLane(p0);
      if (existingLane >= 0 && existingLane !== col) {
        // p0 already claimed by another child (fork point) — diagonal
        lanes[col]!.linesDown.push(existingLane);
      } else if (existingLane < 0) {
        activeLanes[col] = p0;
        lanes[col]!.linesDown.push(col);
      } else {
        lanes[col]!.linesDown.push(col);
      }
    }

    // Merge parents fork to the right
    for (let pi = 1; pi < parentCount; pi++) {
      const p = commit.parents[pi]!;
      const existingLane = findLane(p);
      if (existingLane >= 0) {
        lanes[col]!.linesDown.push(existingLane);
      } else {
        const newLane = firstFreeOrAppend();
        activeLanes[newLane] = p;
        while (lanes.length <= newLane) {
          lanes.push({
            type: "empty",
            color: pickColor(lanes.length),
            linesUp: [],
            linesDown: [],
          });
        }
        lanes[col]!.linesDown.push(newLane);
        lanes[newLane]!.linesDown.push(newLane);
      }
    }

    // Passthrough: active lanes continue straight down
    for (let i = 0; i < lanes.length; i++) {
      if (i !== col && activeLanes[i] != null && !lanes[i]!.linesDown.includes(i)) {
        lanes[i]!.linesDown.push(i);
      }
    }

    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }

    rows.push({ commit, col, lanes, isMerge, isStash, isUncommitted });
  }

  return rows;
});

const graphWidth = computed(() => {
  let max = 1;
  for (const row of graphRows.value) {
    if (row.lanes.length > max) max = row.lanes.length;
  }
  return max * COL_W + 8;
});

function laneX(lane: number): number {
  return lane * COL_W + COL_W / 2 + 2;
}

function isTag(ref: string): boolean {
  return ref.startsWith("tag: ");
}

function isHead(ref: string): boolean {
  return ref === `HEAD -> ${props.head}` || ref === props.head;
}

function refLabel(ref: string): string {
  if (ref.startsWith("tag: ")) return ref.slice(5);
  if (ref.startsWith("HEAD -> ")) return ref.slice(8);
  return ref;
}

// Get lane color for a branch ref badge
function refLaneColor(ref: string, row: GraphRow): string {
  return row.lanes[row.col]?.color ?? pickColor(row.col);
}

// --- Branch path highlighting on hover ---

const hoveredHash = vueRef<string | null>(null);

const firstParentMap = computed(() => {
  const map = new Map<string, string>();
  for (const c of props.commits) {
    if (c.parents.length > 0) map.set(c.hash, c.parents[0]!);
  }
  return map;
});

const firstParentChildMap = computed(() => {
  const map = new Map<string, string[]>();
  for (const c of props.commits) {
    if (c.parents.length > 0) {
      const p0 = c.parents[0]!;
      const arr = map.get(p0);
      if (arr) arr.push(c.hash);
      else map.set(p0, [c.hash]);
    }
  }
  return map;
});

const highlightedHashes = computed<Set<string>>(() => {
  const hash = hoveredHash.value;
  if (!hash) return new Set();

  const result = new Set<string>();
  result.add(hash);

  // Walk down (ancestors) via first-parent
  let cur = hash;
  while (true) {
    const parent = firstParentMap.value.get(cur);
    if (!parent || result.has(parent)) break;
    result.add(parent);
    cur = parent;
  }

  // Walk up (descendants) via first-parent-child links
  const queue = [hash];
  while (queue.length > 0) {
    const h = queue.pop()!;
    const children = firstParentChildMap.value.get(h);
    if (!children) continue;
    for (const child of children) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }

  return result;
});

const isHighlighting = computed(() => hoveredHash.value != null);

watch(
  () => props.commits.length,
  async (next, prev) => {
    if (next === 0 || prev === 0) {
      emitDiag("props-commits-length", { prev, next });
    }
    await nextTick();
    const el = scrollContainer.value;
    if (!el) {
      emitDiag("viewport-missing", undefined, "warn");
      return;
    }
    emitDiag("viewport", {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      rowCount: el.querySelectorAll(".commit-row").length,
      graphRows: graphRows.value.length,
      graphWidth: graphWidth.value,
    });
  },
);

watch(
  () => graphRows.value.length,
  (next, prev) => {
    if (next === 0 || prev === 0) {
      emitDiag("graph-rows-length", { prev, next });
    }
  },
);
</script>

<template>
  <div class="commit-list">
    <div class="list-header">
      <span class="tab active">Commits</span>
    </div>
    <div ref="scrollContainer" class="commits-scroll">
      <div
        v-for="row in graphRows"
        :key="row.commit.hash"
        :data-hash="row.commit.hash"
        class="commit-row"
        :class="{
          selected: row.commit.hash === selected,
          uncommitted: row.isUncommitted,
          dimmed: isHighlighting && !highlightedHashes.has(row.commit.hash),
        }"
        @click="emit('select', row.commit.hash)"
        @mouseenter="hoveredHash = row.commit.hash"
        @mouseleave="hoveredHash = null"
      >
        <svg class="graph-svg" :width="graphWidth" :height="ROW_H">
          <!-- Dashed line dash pattern for uncommitted -->
          <defs v-if="row.isUncommitted">
            <line id="unused" x1="0" y1="0" x2="0" y2="0" />
          </defs>

          <!-- Passthrough vertical lines -->
          <template v-for="(cell, ci) in row.lanes" :key="'pass-' + ci">
            <line
              v-if="cell.type === 'pass'"
              :x1="laneX(ci)"
              :y1="0"
              :x2="laneX(ci)"
              :y2="ROW_H"
              :stroke="cell.color"
              :stroke-width="LINE_W"
              :stroke-dasharray="row.isUncommitted ? '3,3' : undefined"
            />
          </template>

          <!-- Lines down from commit -->
          <template
            v-for="(targetLane, li) in row.lanes[row.col]?.linesDown ?? []"
            :key="'down-' + li"
          >
            <line
              v-if="targetLane === row.col"
              :x1="laneX(row.col)"
              :y1="ROW_H / 2"
              :x2="laneX(row.col)"
              :y2="ROW_H"
              :stroke="row.lanes[row.col]?.color"
              :stroke-width="LINE_W"
              :stroke-dasharray="row.isUncommitted ? '3,3' : undefined"
            />
            <path
              v-else
              :d="`M${laneX(row.col)},${ROW_H / 2} C${laneX(row.col)},${ROW_H} ${laneX(targetLane)},${ROW_H / 2} ${laneX(targetLane)},${ROW_H}`"
              :stroke="pickColor(targetLane)"
              :stroke-width="LINE_W"
              fill="none"
              :stroke-dasharray="row.isUncommitted ? '3,3' : undefined"
            />
          </template>

          <!-- Lines up to commit -->
          <template v-for="(cell, ci) in row.lanes" :key="'up-' + ci">
            <line
              v-if="ci === row.col && cell.linesUp.includes(ci)"
              :x1="laneX(ci)"
              :y1="0"
              :x2="laneX(ci)"
              :y2="ROW_H / 2"
              :stroke="cell.color"
              :stroke-width="LINE_W"
              :stroke-dasharray="row.isUncommitted ? '3,3' : undefined"
            />
          </template>

          <!-- Commit dot -->
          <rect
            v-if="row.isMerge || row.isStash || row.isUncommitted"
            :x="laneX(row.col) - DOT_R"
            :y="ROW_H / 2 - DOT_R"
            :width="DOT_R * 2"
            :height="DOT_R * 2"
            :stroke="row.lanes[row.col]?.color"
            :stroke-width="LINE_W"
            fill="var(--vscode-editor-background, #1e1e1e)"
            rx="1"
            :stroke-dasharray="row.isUncommitted ? '2,2' : undefined"
          />
          <rect
            v-else
            :x="laneX(row.col) - DOT_R"
            :y="ROW_H / 2 - DOT_R"
            :width="DOT_R * 2"
            :height="DOT_R * 2"
            :fill="row.lanes[row.col]?.color"
            rx="1"
          />
        </svg>

        <div class="commit-content">
          <div class="commit-line1">
            <span class="subject" :class="{ 'uncommitted-text': row.isUncommitted }">{{
              row.commit.subject
            }}</span>
            <span v-if="row.commit.refs.length" class="refs">
              <span
                v-for="r in row.commit.refs"
                :key="r"
                class="ref-badge"
                :class="{
                  'ref-tag': isTag(r),
                  'ref-head': isHead(r),
                  'ref-branch': !isTag(r),
                }"
                :style="
                  !isTag(r)
                    ? {
                        borderLeftColor: refLaneColor(r, row),
                        backgroundColor: isHead(r) ? refLaneColor(r, row) + '30' : undefined,
                      }
                    : undefined
                "
                >{{ refLabel(r) }}</span
              >
            </span>
          </div>
          <div v-if="!row.isUncommitted" class="commit-line2">
            <span class="author">{{ row.commit.author }}</span>
            <span class="date">{{ row.commit.date }}</span>
          </div>
        </div>
      </div>
      <div v-if="commits.length === 0" class="empty">No commits</div>
    </div>
  </div>
</template>

<style scoped>
.commit-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-header {
  display: flex;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
  flex-shrink: 0;
}
.tab {
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
  color: var(--vscode-descriptionForeground);
  border-bottom: 2px solid transparent;
}
.tab.active {
  color: var(--vscode-foreground);
  border-bottom-color: var(--vscode-focusBorder, #007acc);
}
.commits-scroll {
  flex: 1;
  overflow: auto;
}
.commit-row {
  display: flex;
  align-items: center;
  cursor: pointer;
  height: 40px;
  transition: opacity 0.15s ease;
}
.commit-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.commit-row.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}
.commit-row.uncommitted {
  opacity: 0.85;
}
.commit-row.dimmed {
  opacity: 0.3;
}
.graph-svg {
  flex-shrink: 0;
  align-self: stretch;
}
.commit-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2px 8px 2px 0;
  gap: 1px;
}
.commit-line1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.subject {
  font-size: 13px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.uncommitted-text {
  font-style: italic;
  opacity: 0.8;
}
.refs {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}
.ref-badge {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 3px;
  white-space: nowrap;
  line-height: 1.6;
}
.ref-tag {
  background: #c8a62a28;
  color: #e8c848;
  border: 1px solid #c8a62a55;
}
.ref-branch {
  background: transparent;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border, #555);
  border-left-width: 3px;
  border-left-style: solid;
}
.ref-head {
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border, #555);
  border-left-width: 3px;
  border-left-style: solid;
  font-weight: 600;
}
.commit-line2 {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}
.commit-row.selected .commit-line2 {
  color: var(--vscode-list-activeSelectionForeground);
  opacity: 0.7;
}
.author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.date {
  flex-shrink: 0;
  white-space: nowrap;
  margin-left: 8px;
}
.empty {
  padding: 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}
</style>
