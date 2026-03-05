<script setup lang="ts">
import { laneColor } from "./graphLayout";
import type { GraphRow } from "./plan";

const props = defineProps<{
  rows: GraphRow[];
  maxGraphWidth: number;
  svgHeight: number;
  hoveredChain: Set<number> | null;
}>();

const LANE_W = 14;
const ROW_H = 38;
const NODE_R = 3.5;

function laneX(col: number) {
  return col * LANE_W + LANE_W / 2;
}
function rowY(index: number) {
  return index * ROW_H + ROW_H / 2;
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

  const parentIndices = row.commit.isStash ? row.parentIndices.slice(0, 1) : row.parentIndices;

  for (let pi = 0; pi < parentIndices.length; pi++) {
    const parentIdx = parentIndices[pi]!;

    if (parentIdx === -1) {
      result.push({ path: `M${x1} ${y1}L${x1} ${y1 + ROW_H}`, color, dashed });
      continue;
    }

    const pRow = props.rows[parentIdx]!;
    const x2 = laneX(pRow.col);
    const y2 = rowY(parentIdx);

    if (row.col === pRow.col) {
      result.push({ path: `M${x1} ${y1}L${x2} ${y2}`, color, dashed });
    } else {
      const parentTopY = y2 - NODE_R;
      const bendSpan = ROW_H * 0.67;
      const bendStartY = Math.max(y1 + 1, parentTopY - bendSpan);
      const laneDelta = row.col - pRow.col;
      const xOff = Math.sign(laneDelta) * Math.min(Math.abs(laneDelta) * 2, NODE_R) * 0.5;
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

function trianglePoints(cx: number, cy: number, r: number): string {
  return `${cx - r},${cy - r} ${cx + r},${cy - r} ${cx},${cy + r}`;
}

function rowDimmed(index: number): boolean {
  return props.hoveredChain !== null && !props.hoveredChain.has(index);
}

function nodeR(index: number): number {
  return NODE_R * (rowDimmed(index) ? 0.75 : 1);
}
</script>

<template>
  <svg
    class="graph-svg"
    :width="maxGraphWidth"
    :height="svgHeight"
    :viewBox="`0 0 ${maxGraphWidth} ${svgHeight}`"
    style="z-index: 1"
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
        :points="trianglePoints(laneX(row.col), rowY(row.index), nodeR(row.index) + 1)"
        :fill="laneColor(row.col)"
      />
      <!-- Stash: diamond (45° rotated rect) -->
      <rect
        v-else-if="row.commit.isStash"
        :x="laneX(row.col) - nodeR(row.index)"
        :y="rowY(row.index) - nodeR(row.index)"
        :width="nodeR(row.index) * 2"
        :height="nodeR(row.index) * 2"
        rx="1"
        fill="var(--bg-base)"
        :stroke="laneColor(row.col)"
        stroke-width="1.5"
        :transform="`rotate(45 ${laneX(row.col)} ${rowY(row.index)})`"
      />
      <!-- Merge: hollow rounded rect -->
      <rect
        v-else-if="row.commit.parents.length > 1"
        :x="laneX(row.col) - nodeR(row.index)"
        :y="rowY(row.index) - nodeR(row.index)"
        :width="nodeR(row.index) * 2"
        :height="nodeR(row.index) * 2"
        rx="1"
        fill="var(--bg-base)"
        :stroke="laneColor(row.col)"
        stroke-width="1.5"
      />
      <!-- Normal commit: filled rounded rect -->
      <rect
        v-else
        :x="laneX(row.col) - nodeR(row.index)"
        :y="rowY(row.index) - nodeR(row.index)"
        :width="nodeR(row.index) * 2"
        :height="nodeR(row.index) * 2"
        rx="1"
        :fill="laneColor(row.col)"
      />
    </template>
  </svg>
</template>

<style scoped>
.graph-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
</style>
