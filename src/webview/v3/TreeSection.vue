<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    count?: number;
    defaultOpen?: boolean;
    nested?: boolean;
    depth?: number;
  }>(),
  { count: 0, defaultOpen: false, nested: false, depth: 0 },
);

const open = ref(props.defaultOpen);
</script>

<template>
  <div :class="['tree-section', { nested }]">
    <div
      class="tree-header"
      :style="nested ? { paddingLeft: depth * 16 + 12 + 'px' } : undefined"
      @click="open = !open"
    >
      <span class="chevron" :class="{ open }">&#9654;</span>
      <span class="label">{{ label }}</span>
      <span class="count">({{ count }})</span>
    </div>
    <div v-if="open" class="tree-children">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tree-section {
  user-select: none;
}
.tree-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  height: 22px;
  transition: background 0.1s;
}
.tree-section.nested .tree-header {
  font-weight: 400;
  height: 20px;
}
.tree-header:hover {
  background: var(--bg-hover);
}
.chevron {
  font-size: 9px;
  transition: transform 0.15s;
  display: inline-block;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
  color: var(--fg-dim);
}
.chevron.open {
  transform: rotate(90deg);
}
.label {
  text-transform: uppercase;
  color: var(--fg-muted);
}
.tree-section.nested .label {
  text-transform: none;
  color: var(--fg);
}
.count {
  color: var(--fg-faint);
  font-weight: 400;
  font-size: 11px;
}
</style>
