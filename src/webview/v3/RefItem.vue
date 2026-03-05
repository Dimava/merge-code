<script setup lang="ts">
import { useAppStore } from "./store";

const props = defineProps<{
  refKey: string;
  name: string;
  depth?: number;
}>();

const store = useAppStore();
</script>

<template>
  <div
    :class="['ref-item', { hidden: store.isHidden(refKey) }]"
    :style="depth != null ? { paddingLeft: depth * 16 + 30 + 'px' } : undefined"
  >
    <span class="item-name">{{ name }}</span>
    <slot />
    <button
      :class="['act-btn', 'eye', { active: store.isHidden(refKey) }]"
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
      :class="['act-btn', 'pin', { active: store.isPinned(refKey) }]"
      :title="store.isPinned(refKey) ? 'Unpin' : 'Pin'"
      @click.stop="store.togglePin(refKey)"
    >
      <svg viewBox="0 0 16 16"><path d="M3 9.5L6.5 6 5 1h6L9.5 6 13 9.5H9l-1 5.5-1-5.5z" /></svg>
    </button>
  </div>
</template>

<style scoped>
.ref-item {
  display: flex;
  align-items: center;
  padding: 2px 0 2px 30px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  transition:
    background 0.1s,
    opacity 0.1s;
}

.ref-item:hover {
  background: var(--bg-hover);
}

.ref-item.hidden:not(:hover) {
  opacity: 0.4;
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
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

.act-btn.pin {
  order: 1;
}
.act-btn.eye {
  order: 2;
  margin-right: 2px;
}

.act-btn svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
  flex-shrink: 0;
}

.ref-item:hover .act-btn,
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
</style>
