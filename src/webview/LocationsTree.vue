<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    count?: number;
    description?: string;
    defaultOpen?: boolean;
    nested?: boolean;
  }>(),
  { count: 0, defaultOpen: false, nested: false },
);

const open = ref(props.defaultOpen);
</script>

<template>
  <div :class="['tree-node', { nested }]">
    <div class="tree-header" @click="open = !open">
      <span class="chevron" :class="{ open }">&#9654;</span>
      <span class="label">{{ label }}</span>
      <span v-if="count != null" class="count">({{ count }})</span>
      <span v-if="description" class="desc">{{ description }}</span>
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
  gap: 4px;
  padding: 3px 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.3px;
}
.tree-node.nested .tree-header {
  padding-left: 24px;
  font-weight: 400;
  font-size: inherit;
  letter-spacing: 0;
}
.tree-header:hover {
  background: var(--vscode-list-hoverBackground);
}
.chevron {
  font-size: 8px;
  transition: transform 0.15s;
  display: inline-block;
  width: 12px;
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
.tree-children {
  /* nested leaves get more indent via their own padding */
}
.tree-node.nested .tree-children :deep(.tree-leaf) {
  padding-left: 40px;
}
</style>
