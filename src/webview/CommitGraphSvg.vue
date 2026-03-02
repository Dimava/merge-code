<script setup lang="ts">
import { computed } from "vue";
import { pickColor } from "./v2/graph-layout";
import type { GraphRow } from "./v2/graph-layout";

const props = defineProps<{
  graphRows: GraphRow[];
  graphWidth: number;
  row: GraphRow;
  ri: number;
}>();

const ROW_H = 40;
const COL_W = 12;
const DOT_R = 4;
const LINE_W = 1.5;
const BOX_ENTRY_INSET_Y = DOT_R;

const rowIndexByHash = computed(() => {
  const map = new Map<string, number>();
  for (let i = 0; i < props.graphRows.length; i++) {
    map.set(props.graphRows[i]!.commit.hash, i);
  }
  return map;
});

const rowByHash = computed(() => {
  const map = new Map<string, GraphRow>();
  for (const row of props.graphRows) {
    map.set(row.commit.hash, row);
  }
  return map;
});

function laneX(lane: number): number {
  return lane * COL_W + COL_W / 2 + 2;
}

function parentHashesForRow(row: GraphRow): string[] {
  return row.isStash ? row.commit.parents.slice(0, 1) : row.commit.parents;
}

function parentRowIndex(parentHash: string): number | null {
  return rowIndexByHash.value.get(parentHash) ?? null;
}

function parentLane(parentHash: string): number | null {
  return rowByHash.value.get(parentHash)?.col ?? null;
}

function connectorEndY(ri: number, parentHash: string): number | null {
  const pri = parentRowIndex(parentHash);
  if (pri == null || pri <= ri) return null;
  return (pri - ri) * ROW_H + ROW_H / 2;
}

function parentBoxEntryY(endY: number): number {
  return endY - DOT_R + BOX_ENTRY_INSET_Y;
}

function verticalConnectorY2(ri: number, parentHash: string, sourceLane: number): number | null {
  const pLane = parentLane(parentHash);
  if (pLane == null || pLane !== sourceLane) return null;
  const endY = connectorEndY(ri, parentHash);
  if (endY == null) return null;
  return parentBoxEntryY(endY);
}

function crossLaneConnectorPath(row: GraphRow, ri: number, parentHash: string): string | null {
  const pLane = parentLane(parentHash);
  const endY = connectorEndY(ri, parentHash);
  if (pLane == null || endY == null || pLane === row.col) return null;

  const sourceX = laneX(row.col);
  const targetX = laneX(pLane);
  const laneDelta = row.col - pLane;
  const targetXOffset = Math.sign(laneDelta) * Math.min(Math.abs(laneDelta) * 2, DOT_R);
  const targetEntryX = targetX + targetXOffset;
  const startY = ROW_H / 2;
  const targetY = parentBoxEntryY(endY);
  const targetTopY = endY - DOT_R;
  const bendSpan = ROW_H * 0.67;
  const bendStartY = Math.max(startY + 1, targetTopY - bendSpan);
  const c1x = sourceX;
  const c1y = bendStartY + bendSpan * 0.35;
  const c2x = targetEntryX;
  const c2y = targetTopY - bendSpan * 0.2;
  return `M${sourceX},${startY} L${sourceX},${bendStartY} C${c1x},${c1y} ${c2x},${c2y} ${targetEntryX},${targetTopY} L${targetEntryX},${targetY}`;
}
</script>

<template>
  <svg class="graph-svg" :width="graphWidth" :height="ROW_H" style="z-index: 1">
    <template v-for="(parentHash, pi) in parentHashesForRow(row)" :key="'curve-' + pi">
      <path
        v-if="crossLaneConnectorPath(row, ri, parentHash)"
        :d="crossLaneConnectorPath(row, ri, parentHash)!"
        :stroke="pickColor(row.col)"
        :stroke-width="LINE_W"
        fill="none"
        :stroke-dasharray="row.isUncommitted ? '3,3' : undefined"
      />
    </template>

    <template v-for="(parentHash, pi) in parentHashesForRow(row)" :key="'down-' + pi">
      <line
        v-if="verticalConnectorY2(ri, parentHash, row.col) != null"
        :x1="laneX(row.col)"
        :y1="ROW_H / 2"
        :x2="laneX(row.col)"
        :y2="verticalConnectorY2(ri, parentHash, row.col)!"
        :stroke="row.lanes[row.col]?.color"
        :stroke-width="LINE_W"
        :stroke-dasharray="row.isUncommitted ? '3,3' : undefined"
      />
    </template>

    <polygon
      v-if="row.isRoot"
      :points="`${laneX(row.col)},${ROW_H / 2 + DOT_R + 1} ${laneX(row.col) - DOT_R - 1},${ROW_H / 2 - DOT_R} ${laneX(row.col) + DOT_R + 1},${ROW_H / 2 - DOT_R}`"
      :fill="row.lanes[row.col]?.color"
    />
    <rect
      v-else-if="row.isMerge || row.isStash || row.isUncommitted"
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
</template>

<style scoped>
.graph-svg {
  flex-shrink: 0;
  align-self: stretch;
  overflow: visible;
}
</style>
