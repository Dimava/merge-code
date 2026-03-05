<script setup lang="ts">
import { computed, ref as vueRef, watch } from "vue";

export interface RefEntry {
  name: string;
  commit?: string;
  date?: string;
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
  pinned: boolean;
}

const props = defineProps<{
  refs: RefEntry[];
  baseDepth?: number;
  head?: string;
  initialPinned?: string[];
}>();

const emit = defineEmits<{
  contextmenu: [e: MouseEvent, entry: RefEntry];
  hiddenChange: [hidden: Set<string>];
  pinnedChange: [pinned: Set<string>];
  clickRef: [entry: RefEntry];
}>();

function onContext(e: MouseEvent, entry?: RefEntry) {
  if (entry) {
    e.preventDefault();
    emit("contextmenu", e, entry);
  }
}

const collapsed = vueRef<Set<string>>(new Set());
const hidden = vueRef<Set<string>>(new Set());
const pinned = vueRef<Set<string>>(new Set(props.initialPinned));

watch(hidden, (val) => emit("hiddenChange", val), { deep: true });
watch(pinned, (val) => emit("pinnedChange", val), { deep: true });

watch(
  () => props.initialPinned,
  (val) => {
    if (val) pinned.value = new Set(val);
  },
);

watch(
  () => props.refs,
  (refs) => {
    const names = new Set(refs.map((r) => r.name));
    let changed = false;
    for (const name of pinned.value) {
      if (!names.has(name)) {
        changed = true;
        break;
      }
    }
    if (changed) {
      pinned.value = new Set([...pinned.value].filter((n) => names.has(n)));
    }
  },
);

function toggle(key: string) {
  const s = new Set(collapsed.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  collapsed.value = s;
}

function childRefNames(folderKey: string): string[] {
  return props.refs
    .filter((r) => r.name.startsWith(folderKey + "/") || r.name === folderKey)
    .map((r) => r.name);
}

function isPrefixPattern(pattern: string): boolean {
  return pattern.endsWith("/");
}

function isNameHidden(name: string, set: Set<string>): boolean {
  if (set.has(name)) return true;
  for (const pattern of set) {
    if (!isPrefixPattern(pattern)) continue;
    if (name.startsWith(pattern)) return true;
  }
  return false;
}

function toggleEye(e: MouseEvent, key: string, isFolder: boolean) {
  e.stopPropagation();
  const s = new Set(hidden.value);
  if (isFolder) {
    const children = childRefNames(key);
    const allHidden = children.length > 0 && children.every((n) => isNameHidden(n, s));
    const folderPattern = `${key}/`;
    if (allHidden) {
      s.delete(folderPattern);
      for (const n of children) s.delete(n);
    } else {
      // Prefer wildcard for folder-level hiding; clear redundant exact leaves.
      s.add(folderPattern);
      for (const n of children) s.delete(n);
    }
  } else {
    if (s.has(key)) s.delete(key);
    else s.add(key);
  }
  hidden.value = s;
}

function isFolderHidden(key: string): boolean {
  const children = childRefNames(key);
  return children.length > 0 && children.every((n) => isNameHidden(n, hidden.value));
}

function togglePin(e: MouseEvent, key: string) {
  e.stopPropagation();
  const s = new Set(pinned.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  pinned.value = s;
}

function onRowClick(row: FlatRow) {
  if (row.isFolder) {
    toggle(row.key);
  } else if (row.entry) {
    emit("clickRef", row.entry);
  }
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
    // Sort: pinned first, then alphabetical
    const nodes = [...children.values()];
    nodes.sort((a, b) => {
      const aPin = pinned.value.has(a.entry?.name ?? a.key);
      const bPin = pinned.value.has(b.entry?.name ?? b.key);
      if (aPin !== bPin) return aPin ? -1 : 1;
      return 0;
    });
    for (const node of nodes) {
      const isFolder = node.children.size > 0;
      const key = node.entry?.name ?? node.key;
      result.push({
        key: node.key,
        label: node.label,
        depth,
        isFolder,
        entry: node.entry,
        pinned: pinned.value.has(key),
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
      :style="{ paddingLeft: row.depth * 14 + 8 + 'px' }"
      :class="{
        current: row.entry?.name === head,
        folder: row.isFolder,
      }"
      @click="onRowClick(row)"
      @contextmenu="onContext($event, row.entry)"
    >
      <span v-if="row.isFolder" class="chevron" :class="{ open: !collapsed.has(row.key) }"
        >&#9654;</span
      >
      <span v-else class="chevron-spacer" />
      <span class="row-label">{{ row.label }}</span>
      <span v-if="row.entry?.date" class="row-date">{{ row.entry.date }}</span>
      <span v-if="row.entry?.behind" class="badge">{{ row.entry.behind }}&darr;</span>
      <span v-if="row.entry?.ahead" class="badge">{{ row.entry.ahead }}&uarr;</span>
      <span class="row-actions">
        <span
          class="pin"
          :class="{ active: row.pinned }"
          @click.stop="togglePin($event, row.entry?.name ?? row.key)"
          title="Pin to top"
          >&#128204;</span
        >
        <span
          class="eye"
          :class="{
            off: row.isFolder
              ? isFolderHidden(row.key)
              : isNameHidden(row.entry?.name ?? row.key, hidden),
          }"
          @click.stop="
            toggleEye($event, row.isFolder ? row.key : (row.entry?.name ?? row.key), row.isFolder)
          "
          title="Show/hide in graph"
          >&#128065;</span
        >
      </span>
    </div>
  </template>
</template>

<style scoped>
.tree-row {
  padding: 0 4px 0 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
  font-weight: 400;
  height: 20px;
  font-size: 12px;
  position: relative;
}
.tree-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.tree-row.current {
  font-weight: 600;
}
.chevron {
  font-size: 10px;
  transition: transform 0.15s;
  display: inline-block;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.chevron.open {
  transform: rotate(90deg);
}
.chevron-spacer {
  display: inline-block;
  width: 14px;
  flex-shrink: 0;
}
.row-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-date {
  color: var(--vscode-descriptionForeground);
  font-size: 10px;
  margin-left: 6px;
  flex-shrink: 0;
}
.badge {
  font-size: 10px;
  padding: 0 3px;
  border-radius: 2px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  flex-shrink: 0;
}
.row-actions {
  display: none;
  gap: 0;
  position: absolute;
  right: 4px;
  top: 0;
  bottom: 0;
  align-items: center;
  background: var(--vscode-list-hoverBackground);
  padding-left: 6px;
}
.tree-row:hover .row-actions {
  display: flex;
}
/* Always show if pin is active or eye is off */
.pin.active,
.eye.off {
  opacity: 1 !important;
}
/* If any action is always-visible, show the container */
.row-actions:has(.pin.active),
.row-actions:has(.eye.off) {
  display: flex;
}
.eye {
  font-size: 12px;
  opacity: 0.3;
  cursor: pointer;
  width: 16px;
  text-align: center;
  filter: grayscale(1);
}
.eye:hover {
  opacity: 0.7;
}
.eye.off {
  opacity: 0.15;
}
.pin {
  font-size: 11px;
  opacity: 0.2;
  cursor: pointer;
  width: 16px;
  text-align: center;
  filter: grayscale(1);
}
.pin:hover {
  opacity: 0.6;
}
.pin.active {
  opacity: 0.7;
  filter: none;
}
</style>
