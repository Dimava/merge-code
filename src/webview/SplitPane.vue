<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";

const props = withDefaults(
  defineProps<{
    // Widths for fixed panes. The final pane is always flex-grow.
    sizes?: number[];
    minSize?: number;
    storageKey?: string;
    collapsedFirst?: boolean;
  }>(),
  { sizes: () => [250, 400], minSize: 100, storageKey: "", collapsedFirst: false },
);

const container = ref<HTMLElement>();
const panelSizes = ref([...props.sizes]);
const dragging = ref(-1);
const startX = ref(0);
const startSizes = ref<number[]>([]);

const visibleIndices = computed(() => {
  const start = props.collapsedFirst ? 1 : 0;
  return panelSizes.value.map((_, i) => i).slice(start);
});

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
  const sizes = [...startSizes.value];

  if (i < sizes.length - 1) {
    const left = Math.max(props.minSize, startSizes.value[i]! + dx);
    const right = Math.max(props.minSize, startSizes.value[i + 1]! - dx);
    sizes[i] = left;
    sizes[i + 1] = right;
    panelSizes.value = sizes;
    return;
  }

  const containerWidth = container.value?.clientWidth ?? 0;
  const dividerPixels = sizes.length;
  const otherFixed = sizes.slice(0, i).reduce((sum, v) => sum + v, 0);
  const maxCurrent = Math.max(props.minSize, containerWidth - dividerPixels - otherFixed);
  const next = Math.min(maxCurrent, Math.max(props.minSize, startSizes.value[i]! + dx));
  sizes[i] = next;
  panelSizes.value = sizes;
}

function onMouseUp() {
  dragging.value = -1;
}

onMounted(() => {
  if (props.storageKey) {
    const raw = localStorage.getItem(props.storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed) &&
          parsed.length === panelSizes.value.length &&
          parsed.every((v) => typeof v === "number" && Number.isFinite(v))
        ) {
          panelSizes.value = parsed.map((v) => Math.max(props.minSize, v));
        }
      } catch {
        // Ignore malformed persisted sizes.
      }
    }
  }
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
});

watch(
  panelSizes,
  (sizes) => {
    if (!props.storageKey) return;
    localStorage.setItem(props.storageKey, JSON.stringify(sizes));
  },
  { deep: true },
);
</script>

<template>
  <div ref="container" class="split-pane" :class="{ dragging: dragging >= 0 }">
    <template v-for="i in visibleIndices" :key="'fixed-' + i">
      <div class="pane" :style="{ width: panelSizes[i] + 'px' }">
        <slot :name="'panel-' + i" />
      </div>
      <div class="divider" @mousedown="onMouseDown($event, i)" />
    </template>
    <div class="pane pane-flex">
      <slot :name="'panel-' + panelSizes.length" />
    </div>
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
  overflow: hidden;
  flex-shrink: 0;
}
.pane-flex {
  flex: 1;
  min-width: 0;
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
