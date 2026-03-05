<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppStore } from "./store";
import { layoutGraph, laneColor } from "./graphLayout";
import type { GraphRow } from "./plan";
import CommitGraphSvg from "./CommitGraphSvg.vue";

const store = useAppStore();

const LANE_W = 14;
const ROW_H = 38;

const layout = computed(() => layoutGraph(store.commits));
const rows = computed(() => layout.value.rows);
const maxGraphWidth = computed(() => layout.value.width * LANE_W);
const svgHeight = computed(() => rows.value.length * ROW_H);

const listEl = ref<HTMLElement>();
const hoveredChain = ref<Set<number> | null>(null);

watch(
  () => store.selectedHash,
  (hash) => {
    if (!hash || !listEl.value) return;
    listEl.value
      .querySelector<HTMLElement>(`[data-hash="${CSS.escape(hash)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  },
  { flush: "post" },
);

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

function decoLaneColor(row: GraphRow): string {
  return laneColor(row.col);
}
</script>

<template>
  <div class="commit-list" ref="listEl" @mouseleave="onRowLeave">
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
          :data-hash="row.commit.hash"
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
            <span v-if="row.commit.deco.length" class="badge-list right">
              <span
                v-for="d in row.commit.deco"
                :key="d.name"
                :class="['badge', d.type, { head: d.isHead }]"
                :style="{ borderLeftColor: decoLaneColor(row), color: decoLaneColor(row) }"
                @click.stop="store.focusLocation(d.type + ':' + d.name)"
                ><span v-if="d.isHead" class="head-dot">●</span>{{ d.name }}</span
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

.badge-list {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.badge-list.right {
  margin-left: auto;
  min-width: 70px;
  justify-content: flex-end;
}

.badge {
  font-size: 10px;
  padding: 0 4px 0 3px;
  line-height: 15px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-left: 3px solid;
  border-radius: 2.7px;
  cursor: pointer;
}

.badge:hover {
  background: color-mix(in srgb, currentColor 18%, transparent);
}

.badge.head {
  font-weight: 600;
}

.head-dot {
  color: #3fb950;
  font-size: 8px;
  margin-right: 4px;
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
