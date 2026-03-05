<script setup lang="ts">
import { ref } from "vue";
import { useAppStore } from "./store";

const store = useAppStore();

const props = withDefaults(
  defineProps<{
    label: string;
    count?: number;
    defaultOpen?: boolean;
    nested?: boolean;
    depth?: number;
    refKey?: string;
    sortKey?: string;
  }>(),
  { count: 0, defaultOpen: false, nested: false, depth: 0 },
);

const open = ref(props.defaultOpen);
</script>

<template>
  <div
    :class="[
      'tree-section',
      { nested, expand: open && !nested },
      refKey && store.isHidden(refKey) ? 'hidden' : '',
    ]"
  >
    <div
      class="tree-header"
      :style="nested ? { paddingLeft: depth * 16 + 12 + 'px' } : undefined"
      @click="count > 0 && (open = !open)"
    >
      <span v-if="count === 0" class="chevron">&#9679;</span>
      <span v-else class="chevron" :class="{ open }">&#9654;</span>
      <span class="label">{{ label }}</span>
      <span class="count">({{ count }})</span>
      <span v-if="sortKey || refKey" class="spacer" />
      <button
        v-if="sortKey"
        :class="['act-btn', { active: store.isTimeSorted(sortKey) }]"
        :title="store.isTimeSorted(sortKey) ? 'Sort by name' : 'Sort by time'"
        @click.stop="store.toggleTimeSort(sortKey)"
      >
        <svg viewBox="0 0 16 16">
          <path
            d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11zM8.5 4H7v4.5l3.5 2 .75-1.23L8.5 7.5z"
          />
        </svg>
      </button>
      <template v-if="refKey">
        <button
          :class="['act-btn', { active: store.isHidden(refKey) }]"
          :title="store.isHidden(refKey) ? 'Show' : 'Hide'"
          @click.stop="store.toggleHide(refKey)"
        >
          <svg viewBox="0 0 16 16">
            <path
              d="M8 3.5C4.7 3.5 1.8 5.4.5 8c1.3 2.6 4.2 4.5 7.5 4.5s6.2-1.9 7.5-4.5C14.2 5.4 11.3 3.5 8 3.5zm0 7.5a3 3 0 110-6 3 3 0 010 6z"
            />
            <line
              v-if="store.isHidden(refKey)"
              x1="2"
              y1="14"
              x2="14"
              y2="2"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
        <button
          :class="['act-btn', { active: store.isPinned(refKey) }]"
          :title="store.isPinned(refKey) ? 'Unpin' : 'Pin'"
          @click.stop="store.togglePin(refKey)"
        >
          <svg viewBox="0 0 16 16">
            <path d="M3 9.5L6.5 6 5 1h6L9.5 6 13 9.5H9l-1 5.5-1-5.5z" />
          </svg>
        </button>
      </template>
    </div>
    <div class="tree-pinned">
      <slot name="pinned" />
    </div>
    <div v-if="open" class="tree-children">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tree-section {
  user-select: none;
  flex-shrink: 0;
}

.tree-section.expand {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 22px;
  overflow: hidden;
}

.tree-section.expand > .tree-children {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.tree-pinned {
  flex-shrink: 0;
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
.spacer {
  flex: 1;
}
.act-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--fg-dim);
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
}
.act-btn svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
  flex-shrink: 0;
}
.tree-header:hover .act-btn,
.act-btn.active {
  width: 18px;
  overflow: visible;
}
.act-btn:hover {
  background: var(--bg-selected);
  color: var(--fg);
}
.act-btn.active {
  color: var(--fg);
}
.tree-section.hidden:not(:hover) {
  opacity: 0.4;
}
</style>
