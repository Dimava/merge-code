<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const container = ref<HTMLElement>();
const col1 = ref(200);
const col2 = ref(400);
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
  <div
    ref="container"
    class="split-grid"
    :style="{
      gridTemplateColumns: `${col1}px 4px ${col2}px 4px minmax(${minPane3}px, 1fr)`,
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
</template>

<style scoped>
.split-grid {
  display: grid;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-x: auto;
}

.pane-slot {
  overflow: auto;
  min-width: 0;
}

.divider {
  background: #333;
  cursor: col-resize;
  transition: background 0.15s;
}
.divider:hover,
.divider:active {
  background: #555;
}
</style>
