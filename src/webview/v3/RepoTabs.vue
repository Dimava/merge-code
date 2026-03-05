<script setup lang="ts">
import { useAppStore } from "./store";

const store = useAppStore();
</script>

<template>
  <div class="tab-bar">
    <div class="tabs-scroll">
      <button
        v-for="r in store.repos"
        :key="r.id"
        :class="['tab', { active: r.id === store.activeRepo }]"
        @click="store.switchRepo(r.id)"
      >
        {{ r.name }}
      </button>
    </div>
    <button
      class="theme-toggle"
      @click="store.toggleTheme"
      :title="store.theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
    >
      <svg
        v-if="store.theme === 'dark'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg
        v-else
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  min-height: 30px;
}

.tabs-scroll {
  display: flex;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 0;
}

.tab {
  padding: 5px 14px;
  font-size: 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--fg-dim);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  transition:
    color 0.15s,
    background 0.15s;
}

.tab:hover {
  color: var(--fg-muted);
  background: var(--bg-hover);
}

.tab.active {
  color: var(--fg);
  border-bottom-color: var(--accent);
}

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-left: 1px solid var(--border);
  color: var(--fg-dim);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.theme-toggle:hover {
  color: var(--accent);
  background: var(--bg-hover);
}
</style>
