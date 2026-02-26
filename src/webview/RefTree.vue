<script setup lang="ts">
import { computed, ref as vueRef } from "vue";

export interface RefEntry {
  name: string;
  commit?: string;
  ahead?: number;
  behind?: number;
  isHead?: boolean;
}

interface FlatRow {
  key: string;
  label: string;
  depth: number;
  isFolder: boolean;
  entry?: RefEntry;
  childCount: number;
}

const props = defineProps<{
  refs: RefEntry[];
  baseDepth?: number;
  head?: string;
}>();

const emit = defineEmits<{
  contextmenu: [e: MouseEvent, entry: RefEntry];
}>();

function onContext(e: MouseEvent, entry?: RefEntry) {
  if (entry) {
    e.preventDefault();
    emit("contextmenu", e, entry);
  }
}

const collapsed = vueRef<Set<string>>(new Set());

function toggle(key: string) {
  const s = new Set(collapsed.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  collapsed.value = s;
}

const rows = computed(() => {
  const result: FlatRow[] = [];
  const base = props.baseDepth ?? 0;

  // Build tree structure first
  interface Node {
    label: string;
    key: string;
    entry?: RefEntry;
    children: Map<string, Node>;
  }

  const root = new Map<string, Node>();

  for (const entry of props.refs) {
    const parts = entry.name.split("/");
    let children = root;
    let keyPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      keyPath = keyPath ? `${keyPath}/${part}` : part;
      let node = children.get(part);
      if (!node) {
        node = { label: part, key: keyPath, children: new Map() };
        children.set(part, node);
      }
      if (i === parts.length - 1) {
        node.entry = entry;
      }
      children = node.children;
    }
  }

  // Flatten with collapse state
  function countLeaves(children: Map<string, Node>): number {
    let count = 0;
    for (const node of children.values()) {
      if (node.children.size === 0) count++;
      else count += countLeaves(node.children);
    }
    return count;
  }

  function flatten(children: Map<string, Node>, depth: number) {
    for (const node of children.values()) {
      const isFolder = node.children.size > 0;
      result.push({
        key: node.key,
        label: node.label,
        depth,
        isFolder,
        entry: node.entry,
        childCount: isFolder ? countLeaves(node.children) : 0,
      });
      if (isFolder && !collapsed.value.has(node.key)) {
        flatten(node.children, depth + 1);
      }
    }
  }

  flatten(root, base);
  return result;
});
</script>

<template>
  <template v-for="row in rows" :key="row.key">
    <div
      v-if="row.isFolder"
      class="tree-folder"
      :style="{ paddingLeft: (row.depth * 16 + 12) + 'px' }"
      @click="toggle(row.key)"
      @contextmenu="onContext($event, row.entry)"
    >
      <span class="chevron" :class="{ open: !collapsed.has(row.key) }">&#9654;</span>
      <span class="folder-label">{{ row.label }}</span>
      <span v-if="row.entry?.behind" class="badge behind">{{ row.entry.behind }}&darr;</span>
      <span v-if="row.entry?.ahead" class="badge ahead">{{ row.entry.ahead }}&uarr;</span>
    </div>
    <div
      v-else
      class="tree-leaf"
      :style="{ paddingLeft: (row.depth * 16 + 12) + 'px' }"
      :class="{ current: row.entry?.isHead || row.entry?.name === head }"
      @contextmenu="onContext($event, row.entry)"
    >
      <span class="leaf-name">{{ row.label }}</span>
      <span v-if="row.entry?.behind" class="badge behind">{{ row.entry.behind }}&darr;</span>
      <span v-if="row.entry?.ahead" class="badge ahead">{{ row.entry.ahead }}&uarr;</span>
    </div>
  </template>
</template>

<style scoped>
.tree-folder {
  padding: 3px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-weight: 600;
}
.tree-folder:hover {
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
.folder-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tree-leaf {
  padding: 2px 12px 2px 40px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.tree-leaf:hover {
  background: var(--vscode-list-hoverBackground);
}
.tree-leaf.current {
  font-weight: 600;
}
.leaf-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  font-size: 11px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  flex-shrink: 0;
}
</style>
