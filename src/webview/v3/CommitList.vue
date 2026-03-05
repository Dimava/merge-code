<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppStore } from "./store";
import { layoutGraph, laneColor } from "./graphLayout";
import type { GraphRow } from "./plan";

const store = useAppStore();

const LANE_W = 14;
const ROW_H = 38;
const NODE_R = 3.5;

const layout = computed(() => layoutGraph(store.commits));
const rows = computed(() => layout.value.rows);
const maxGraphWidth = computed(() => layout.value.width * LANE_W);
const svgHeight = computed(() => rows.value.length * ROW_H);

const hoveredChain = ref<Set<number> | null>(null);

function laneX(col: number) {
  return col * LANE_W + LANE_W / 2;
}
function rowY(index: number) {
  return index * ROW_H + ROW_H / 2;
}

function rowGraphW(row: GraphRow): number {
  return row.width * LANE_W;
}

// ── Lines: each commit owns one full continuous path per parent ──

interface LineDef {
  path: string;
  color: string;
  dashed: boolean;
}

function linesForRow(row: GraphRow): LineDef[] {
  const result: LineDef[] = [];
  const x1 = laneX(row.col);
  const y1 = rowY(row.index);
  const color = laneColor(row.col);
  const dashed = !!row.commit.isUncommitted;

  const parentIndices = row.commit.isStash
    ? row.parentIndices.slice(0, 1)
    : row.parentIndices;

  for (let pi = 0; pi < parentIndices.length; pi++) {
    const parentIdx = parentIndices[pi]!;

    if (parentIdx === -1) {
      result.push({ path: `M${x1} ${y1}L${x1} ${y1 + ROW_H}`, color, dashed });
      continue;
    }

    const pRow = rows.value[parentIdx]!;
    const x2 = laneX(pRow.col);
    const y2 = rowY(parentIdx);

    if (row.col === pRow.col) {
      result.push({ path: `M${x1} ${y1}L${x2} ${y2}`, color, dashed });
    } else {
      const parentTopY = y2 - NODE_R;
      const bendSpan = ROW_H * 0.67;
      const bendStartY = Math.max(y1 + 1, parentTopY - bendSpan);
      const laneDelta = row.col - pRow.col;
      const xOff = Math.sign(laneDelta) * Math.min(Math.abs(laneDelta) * 2, NODE_R);
      const entryX = x2 + xOff;
      const c1y = bendStartY + bendSpan * 0.35;
      const c2y = parentTopY - bendSpan * 0.2;

      result.push({
        path: `M${x1} ${y1}L${x1} ${bendStartY}C${x1} ${c1y} ${entryX} ${c2y} ${entryX} ${parentTopY}L${entryX} ${y2}`,
        color,
        dashed,
      });
    }
  }

  return result;
}

// ── Node shapes ──

function trianglePoints(cx: number, cy: number): string {
  const r = NODE_R + 1;
  return `${cx - r},${cy - r} ${cx + r},${cy - r} ${cx},${cy + r}`;
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
      <svg
        class="graph-svg"
        :width="maxGraphWidth"
        :height="svgHeight"
        :viewBox="`0 0 ${maxGraphWidth} ${svgHeight}`"
      >
        <!-- Lines first (all commits, then nodes on top) -->
        <template v-for="row in rows" :key="'l-' + row.index">
          <path
            v-for="(line, li) in linesForRow(row)"
            :key="li"
            :d="line.path"
            :stroke="line.color"
            :stroke-width="rowDimmed(row.index) ? 0.5 : 1.5"
            fill="none"
            :stroke-dasharray="line.dashed ? '4 3' : undefined"
          />
        </template>

        <!-- Nodes -->
        <template v-for="row in rows" :key="'n-' + row.index">
          <!-- Root (no visible parent): triangle -->
          <polygon
            v-if="row.isVisibleRoot"
            :points="trianglePoints(laneX(row.col), rowY(row.index))"
            :fill="laneColor(row.col)"
            :opacity="rowDimmed(row.index) ? 0.25 : 1"
          />
          <!-- Stash / uncommitted: diamond (45° rotated rect) -->
          <rect
            v-else-if="row.commit.isStash || row.commit.isUncommitted"
            :x="laneX(row.col) - NODE_R"
            :y="rowY(row.index) - NODE_R"
            :width="NODE_R * 2"
            :height="NODE_R * 2"
            rx="1"
            fill="var(--bg-base)"
            :stroke="laneColor(row.col)"
            stroke-width="1.5"
            :stroke-dasharray="row.commit.isUncommitted ? '2 2' : undefined"
            :transform="`rotate(45 ${laneX(row.col)} ${rowY(row.index)})`"
            :opacity="rowDimmed(row.index) ? 0.25 : 1"
          />
          <!-- Merge: hollow rounded rect -->
          <rect
            v-else-if="row.commit.parents.length > 1"
            :x="laneX(row.col) - NODE_R"
            :y="rowY(row.index) - NODE_R"
            :width="NODE_R * 2"
            :height="NODE_R * 2"
            rx="1"
            fill="var(--bg-base)"
            :stroke="laneColor(row.col)"
            stroke-width="1.5"
            :opacity="rowDimmed(row.index) ? 0.25 : 1"
          />
          <!-- Normal commit: filled rounded rect -->
          <rect
            v-else
            :x="laneX(row.col) - NODE_R"
            :y="rowY(row.index) - NODE_R"
            :width="NODE_R * 2"
            :height="NODE_R * 2"
            rx="1"
            :fill="laneColor(row.col)"
            :opacity="rowDimmed(row.index) ? 0.25 : 1"
          />
        </template>
      </svg>

      <!-- Row overlays for text + interaction -->
      <div class="rows-layer">
        <div
          v-for="row in rows"
          :key="row.commit.hash"
          :class="['row', {
            selected: store.selectedHash === row.commit.hash,
            dimmed: rowDimmed(row.index),
          }]"
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
            <span class="deco-list">
              <span
                v-for="d in row.commit.deco"
                :key="d.name"
                :class="['deco', d.type, { head: d.isHead }]"
                :style="{ borderLeftColor: decoColor(d) }"
              >{{ d.name }}</span>
            </span>
            <span class="author">{{ row.commit.author }}</span>
            <span v-if="row.commit.date" class="date">{{ row.commit.date }}</span>
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

.graph-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
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
