<script setup lang="ts">
import { computed, watch, nextTick, ref as vueRef } from "vue";
import { pickColor } from "./graph-layout";
import type { GraphRow } from "./graph-layout";
import CommitGraphSvg from "./CommitGraphSvg.vue";

const props = defineProps<{
  graphRows: GraphRow[];
  graphWidth: number;
  selected?: string;
  focusHash?: string;
  head?: string;
}>();

const emit = defineEmits<{
  select: [hash: string];
}>();

const scrollContainer = vueRef<HTMLElement>();
const COL_W = 12;
const GRAPH_PAD = 8;
const expandedMerges = vueRef<Set<string>>(new Set());

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

function refLaneColor(ref: string, row: GraphRow): string {
  return row.lanes[row.col]?.color ?? pickColor(row.col);
}

function rowGraphWidth(row: GraphRow): number {
  return Math.max(1, row.lanes.length) * COL_W + GRAPH_PAD;
}

function toggleMergeParents(hash: string) {
  const next = new Set(expandedMerges.value);
  if (next.has(hash)) next.delete(hash);
  else next.add(hash);
  expandedMerges.value = next;
}

function ancestorsOf(
  startHash: string | undefined,
  byHash: Map<string, GraphRow>,
  cache: Map<string, Set<string>>,
): Set<string> {
  if (!startHash) return new Set();
  const cached = cache.get(startHash);
  if (cached) return cached;

  const out = new Set<string>();
  const queue: string[] = [startHash];
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (out.has(hash)) continue;
    const row = byHash.get(hash);
    if (!row) continue;
    out.add(hash);
    for (const p of row.commit.parents) queue.push(p);
  }
  cache.set(startHash, out);
  return out;
}

const displayedRows = computed<GraphRow[]>(() => {
  if (props.graphRows.length === 0) return [];

  const byHash = new Map<string, GraphRow>(props.graphRows.map((r) => [r.commit.hash, r]));
  const cache = new Map<string, Set<string>>();
  const hidden = new Set<string>();

  for (const row of props.graphRows) {
    if (!row.isMerge) continue;
    if (expandedMerges.value.has(row.commit.hash)) continue;

    const primary = ancestorsOf(row.commit.parents[0], byHash, cache);
    for (let i = 1; i < row.commit.parents.length; i++) {
      const secondary = ancestorsOf(row.commit.parents[i], byHash, cache);
      for (const h of secondary) {
        if (!primary.has(h)) hidden.add(h);
      }
    }
  }

  return props.graphRows.filter((r) => !hidden.has(r.commit.hash));
});

// --- Branch path highlighting on hover ---

const hoveredHash = vueRef<string | null>(null);

const firstParentMap = computed(() => {
  const map = new Map<string, string>();
  for (const row of displayedRows.value) {
    const c = row.commit;
    if (c.parents.length > 0) map.set(c.hash, c.parents[0]!);
  }
  return map;
});

const firstParentChildMap = computed(() => {
  const map = new Map<string, string[]>();
  for (const row of displayedRows.value) {
    const c = row.commit;
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

  let cur = hash;
  while (true) {
    const parent = firstParentMap.value.get(cur);
    if (!parent || result.has(parent)) break;
    result.add(parent);
    cur = parent;
  }

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
  () => displayedRows.value.length,
  async (next, prev) => {
    if (next === 0 || prev === 0) {
      emitDiag("graph-rows-length", { prev, next });
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
      graphRows: displayedRows.value.length,
      graphWidth: props.graphWidth,
    });
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
        v-for="(row, ri) in displayedRows"
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
        <CommitGraphSvg
          class="graph-svg"
          :graph-rows="displayedRows"
          :graph-width="rowGraphWidth(row)"
          :row="row"
          :ri="ri"
          :show-all-parents="expandedMerges.has(row.commit.hash)"
          @toggle-parents="toggleMergeParents"
        />

        <div class="commit-content">
          <div class="commit-line1">
            <span class="subject" :class="{ 'uncommitted-text': row.isUncommitted }">{{
              row.commit.subject
            }}</span>
          </div>
          <div class="commit-line2">
            <span class="author">{{ row.commit.author }}</span>
            <span v-if="!row.isUncommitted && row.commit.refs.length" class="refs">
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
        </div>
      </div>
      <div v-if="displayedRows.length === 0" class="empty">No commits</div>
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
  overflow: visible;
  transition: opacity 0.15s ease;
}
.commit-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.commit-row.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}
.commit-row.dimmed .commit-content {
  opacity: 0.8;
}
.commit-row.dimmed .graph-svg {
  opacity: 0.8;
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
  background: #ffd84d;
  color: #111111;
  border: 1px solid #e0b700;
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
.empty {
  padding: 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}
</style>
