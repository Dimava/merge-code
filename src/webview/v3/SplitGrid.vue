<script setup lang="ts">
import { ref } from "vue";

const container = ref<HTMLElement>();
const col1 = ref(200);
const col2 = ref(250);
const minPane3 = 300;

let dragging: 1 | 2 | null = null;
let startX = 0;
let startVal = 0;

function onPointerDown(divider: 1 | 2, e: PointerEvent) {
  dragging = divider;
  startX = e.clientX;
  startVal = divider === 1 ? col1.value : col2.value;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  const dx = e.clientX - startX;
  const next = Math.max(120, startVal + dx);
  if (dragging === 1) col1.value = next;
  else col2.value = next;
}

function onPointerUp() {
  dragging = null;
}
</script>

<template>
  <div class="split-grid-scroll">
    <div
      ref="container"
      class="split-grid"
      :style="{
        gridTemplateColumns: `${col1}px 1px ${col2}px 1px minmax(${minPane3}px, 1fr)`,
        minWidth: `${col1 + 1 + col2 + 1 + minPane3}px`,
      }"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
    >
      <div class="pane-slot">
        <slot name="pane1" />
      </div>
      <div class="divider" @pointerdown="onPointerDown(1, $event)" />
      <div class="pane-slot">
        <slot name="pane2" />
      </div>
      <div class="divider" @pointerdown="onPointerDown(2, $event)" />
      <div class="pane-slot">
        <slot name="pane3" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.split-grid-scroll {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.split-grid {
  display: grid;
  height: 100%;
  width: 100%;
  min-height: 0;
}

.pane-slot {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  min-width: 0;
}

.divider {
  background: var(--border);
  cursor: col-resize;
  transition: background 0.15s;
  position: relative;
}
.divider::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: -3px;
}
.divider:hover,
.divider:active {
  background: var(--accent);
}
</style>
