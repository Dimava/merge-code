<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    sizes?: number[];
    minSize?: number;
  }>(),
  { sizes: () => [250, 400, 350], minSize: 100 },
);

const container = ref<HTMLElement>();
const panelSizes = ref([...props.sizes]);
const dragging = ref(-1);
const startX = ref(0);
const startSizes = ref<number[]>([]);

function onMouseDown(e: MouseEvent, index: number) {
  dragging.value = index;
  startX.value = e.clientX;
  startSizes.value = [...panelSizes.value];
  e.preventDefault();
}

function onMouseMove(e: MouseEvent) {
  if (dragging.value < 0) return;
  const dx = e.clientX - startX.value;
  const i = dragging.value;
  const left = Math.max(props.minSize, startSizes.value[i]! + dx);
  const right = Math.max(props.minSize, startSizes.value[i + 1]! - dx);
  const sizes = [...panelSizes.value];
  sizes[i] = left;
  sizes[i + 1] = right;
  panelSizes.value = sizes;
}

function onMouseUp() {
  dragging.value = -1;
}

onMounted(() => {
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
  <div ref="container" class="split-pane" :class="{ dragging: dragging >= 0 }">
    <template v-for="(size, i) in panelSizes" :key="i">
      <div class="pane" :style="{ width: size + 'px' }">
        <slot :name="'panel-' + i" />
      </div>
      <div
        v-if="i < panelSizes.length - 1"
        class="divider"
        @mousedown="onMouseDown($event, i)"
      />
    </template>
  </div>
</template>

<style scoped>
.split-pane {
  display: flex;
  height: 100%;
  overflow: hidden;
}
.split-pane.dragging {
  cursor: col-resize;
  user-select: none;
}
.pane {
  overflow: auto;
  flex-shrink: 0;
}
.pane:last-of-type {
  flex: 1;
  width: auto !important;
}
.divider {
  width: 1px;
  background: var(--vscode-panel-border, #333);
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
}
.divider::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: -3px;
}
</style>
