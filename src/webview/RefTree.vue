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
const hidden = vueRef<Set<string>>(new Set());

function toggle(key: string) {
  const s = new Set(collapsed.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  collapsed.value = s;
}

function toggleEye(e: MouseEvent, key: string) {
  e.stopPropagation();
  const s = new Set(hidden.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  hidden.value = s;
}

const rows = computed(() => {
  const result: FlatRow[] = [];
  const base = props.baseDepth ?? 0;

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

  function flatten(children: Map<string, Node>, depth: number) {
    for (const node of children.values()) {
      const isFolder = node.children.size > 0;
      result.push({
        key: node.key,
        label: node.label,
        depth,
        isFolder,
        entry: node.entry,
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
      class="tree-row"
      :style="{ paddingLeft: (row.depth * 16 + 12) + 'px' }"
      :class="{
        current: row.entry?.name === head,
        folder: row.isFolder,
      }"
      @click="row.isFolder ? toggle(row.key) : undefined"
      @contextmenu="onContext($event, row.entry)"
    >
      <span v-if="row.isFolder" class="chevron" :class="{ open: !collapsed.has(row.key) }">&#9654;</span>
      <span class="row-label">{{ row.label }}</span>
      <span v-if="row.entry?.behind" class="badge">{{ row.entry.behind }}&darr;</span>
      <span v-if="row.entry?.ahead" class="badge">{{ row.entry.ahead }}&uarr;</span>
      <span
        class="eye"
        :class="{ off: hidden.has(row.entry?.name ?? row.key) }"
        @click.stop="toggleEye($event, row.entry?.name ?? row.key)"
        title="Show/hide in graph"
      >&#128065;</span>
    </div>
  </template>
</template>

<style scoped>
.tree-row {
  padding: 2px 8px 2px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-weight: 400;
  height: 22px;
}
.tree-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.tree-row.current {
  font-weight: 600;
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
.row-label {
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
.eye {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.4;
  cursor: pointer;
  width: 20px;
  text-align: center;
  filter: grayscale(1);
}
.eye:hover {
  opacity: 0.8;
}
.eye.off {
  opacity: 0.15;
}
</style>
