<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    count?: number;
    description?: string;
    defaultOpen?: boolean;
    nested?: boolean;
    depth?: number;
    eyeOff?: boolean;
    showEye?: boolean;
  }>(),
  { count: 0, defaultOpen: false, nested: false, depth: 0, eyeOff: false, showEye: false },
);

const emit = defineEmits<{
  toggleEye: [];
}>();

const open = ref(props.defaultOpen);
let eyeToggleQueued = false;

function onEyeClick(e: MouseEvent) {
  e.stopPropagation();
  // Defer to next microtask to avoid re-entrant update loops
  // when parent handlers synchronously mutate reactive graph visibility state.
  if (eyeToggleQueued) return;
  eyeToggleQueued = true;
  queueMicrotask(() => {
    eyeToggleQueued = false;
    emit("toggleEye");
  });
}

function onHeaderClick() {
  open.value = !open.value;
}
</script>

<template>
  <div :class="['tree-node', { nested }]">
    <div
      class="tree-header"
      :style="nested ? { paddingLeft: depth * 16 + 12 + 'px' } : undefined"
      @click="onHeaderClick"
    >
      <span class="chevron" :class="{ open }">&#9654;</span>
      <span class="label">{{ label }}</span>
      <span v-if="count != null" class="count">({{ count }})</span>
      <span v-if="description" class="desc">{{ description }}</span>
      <span
        v-if="showEye"
        class="eye"
        :class="{ off: eyeOff }"
        @click="onEyeClick"
        title="Show/hide all in graph"
        >&#128065;</span
      >
    </div>
    <div v-if="open" class="tree-children">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  user-select: none;
}
.tree-header {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.3px;
  height: 22px;
}
.tree-node.nested .tree-header {
  font-weight: 400;
  font-size: 12px;
  letter-spacing: 0;
  height: 20px;
}
.tree-header:hover {
  background: var(--vscode-list-hoverBackground);
}
.chevron {
  font-size: 11px;
  transition: transform 0.15s;
  display: inline-block;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.chevron.open {
  transform: rotate(90deg);
}
.label {
  text-transform: uppercase;
}
.tree-node.nested .label {
  text-transform: none;
}
.count {
  color: var(--vscode-descriptionForeground);
  font-weight: 400;
}
.desc {
  color: var(--vscode-descriptionForeground);
  font-weight: 400;
  margin-left: auto;
  font-size: 11px;
}
.eye {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0;
  cursor: pointer;
  width: 16px;
  text-align: center;
  filter: grayscale(1);
  margin-left: auto;
  transition: opacity 0.15s;
}
.tree-header:hover .eye {
  opacity: 0.3;
}
.eye:hover {
  opacity: 0.7 !important;
}
.eye.off {
  opacity: 0.15;
}
</style>
