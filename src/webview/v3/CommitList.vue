<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppStore } from "./store";
import { layoutGraph } from "./graphLayout";
import type { GraphRow } from "./plan";
import CommitGraphSvg from "./CommitGraphSvg.vue";

const store = useAppStore();

const LANE_W = 14;
const ROW_H = 38;

const layout = computed(() => layoutGraph(store.commits));
const rows = computed(() => layout.value.rows);
const maxGraphWidth = computed(() => layout.value.width * LANE_W);
const svgHeight = computed(() => rows.value.length * ROW_H);

const hoveredChain = ref<Set<number> | null>(null);

function rowGraphW(row: GraphRow): number {
  return row.width * LANE_W;
}

// ── Hover chain ──

function buildFirstParentChain(rowIndex: number): Set<number> {
  const chain = new Set<number>();
  const allRows = rows.value;

  let cur = rowIndex;
  while (cur >= 0) {
    if (chain.has(cur)) break;
    chain.add(cur);
    const row = allRows[cur]!;
    if (row.childIndices.length === 0) break;
    const firstChild = row.childIndices.find((ci) => {
      const cr = allRows[ci]!;
      return cr.parentIndices[0] === cur;
    });
    if (firstChild === undefined) break;
    cur = firstChild;
  }

  cur = rowIndex;
  while (cur >= 0 && cur < allRows.length) {
    chain.add(cur);
    const row = allRows[cur]!;
    const fp = row.parentIndices[0];
    if (fp === undefined || fp === -1) break;
    cur = fp;
  }

  return chain;
}

function onRowEnter(index: number) {
  hoveredChain.value = buildFirstParentChain(index);
}
function onRowLeave() {
  hoveredChain.value = null;
}
function rowDimmed(index: number): boolean {
  return hoveredChain.value !== null && !hoveredChain.value.has(index);
}

function decoColor(d: { type: string; isHead?: true }): string {
  if (d.isHead) return "var(--accent)";
  if (d.type === "branch") return "var(--accent-blue)";
  if (d.type === "remote") return "var(--accent-purple)";
  if (d.type === "tag") return "var(--accent-yellow)";
  return "var(--fg-faint)";
}
</script>

<template>
  <div class="commit-list" @mouseleave="onRowLeave">
    <div class="scroll-area">
      <CommitGraphSvg
        :rows="rows"
        :max-graph-width="maxGraphWidth"
        :svg-height="svgHeight"
        :hovered-chain="hoveredChain"
      />

      <!-- Row overlays for text + interaction -->
      <div class="rows-layer">
        <div
          v-for="row in rows"
          :key="row.commit.hash"
          :class="[
            'row',
            {
              selected: store.selectedHash === row.commit.hash,
              dimmed: rowDimmed(row.index),
            },
          ]"
          :style="{ paddingLeft: rowGraphW(row) + 8 + 'px' }"
          @mouseenter="onRowEnter(row.index)"
          @click="store.selectCommit(row.commit.hash)"
        >
          <div class="row-line1">
            <span class="subject" :class="{ uncommitted: row.commit.isUncommitted }">
              {{ row.commit.subject }}
            </span>
          </div>
          <div class="row-line2">
            <span class="author">{{ row.commit.author }}</span>
            <span v-if="row.commit.deco.length" class="deco-list right">
              <span
                v-for="d in row.commit.deco"
                :key="d.name"
                :class="['deco', d.type, { head: d.isHead }]"
                :style="{ borderLeftColor: decoColor(d) }"
                >{{ d.name }}</span
              >
            </span>
            <span v-else-if="row.commit.date" class="date">{{ row.commit.date }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.commit-list {
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}

.scroll-area {
  position: relative;
}

.rows-layer {
  position: relative;
}

.row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  height: 38px;
  padding-right: 10px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.1s;
}

.row:hover {
  background: var(--bg-hover);
}

.row.selected {
  background: var(--bg-selected);
}

.row.dimmed {
  opacity: 0.3;
}

.row-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.2;
  min-width: 0;
}

.row-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.2;
  min-width: 0;
}

.subject {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--fg);
}

.subject.uncommitted {
  font-style: italic;
  color: var(--fg-dim);
}

.deco-list {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.deco-list.right {
  margin-left: auto;
  min-width: 70px;
  justify-content: flex-end;
}

.deco {
  font-size: 10px;
  padding: 0 5px;
  line-height: 15px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fg-muted);
  background: transparent;
  border-left: 2px solid;
  border-radius: 0;
}

.deco.branch {
  color: var(--accent-blue);
}

.deco.branch.head {
  color: var(--accent);
  font-weight: 600;
}

.deco.remote {
  color: var(--accent-purple);
}

.deco.tag {
  color: var(--accent-yellow);
}

.deco.stash {
  color: var(--fg-dim);
}

.author {
  color: var(--accent-orange);
  font-size: 11px;
  flex-shrink: 0;
}

.date {
  color: var(--fg-faint);
  font-size: 11px;
  min-width: 70px;
  text-align: right;
  margin-left: auto;
}
</style>
