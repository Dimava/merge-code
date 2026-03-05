<script setup lang="ts">
import { useAppStore } from "./store";
import TreeSection from "./TreeSection.vue";

const store = useAppStore();
</script>

<template>
  <div class="locations">
    <div class="head-bar" v-if="store.locations.head">
      <span class="head-icon">&#9679;</span>
      {{ store.locations.head }}
    </div>

    <TreeSection label="Branches" :count="store.locations.branches.length" default-open>
      <div v-for="b in store.locations.branches" :key="b.name" class="tree-item">
        <span class="item-name">{{ b.name }}</span>
        <span v-if="b.ahead || b.behind" class="badge">
          <span v-if="b.ahead" class="ahead">{{ b.ahead }}&#8593;</span>
          <span v-if="b.behind" class="behind">{{ b.behind }}&#8595;</span>
        </span>
        <span v-if="b.tracking" class="tracking">{{ b.tracking }}</span>
      </div>
    </TreeSection>

    <TreeSection label="Remotes" :count="store.locations.remotes.length" default-open>
      <TreeSection
        v-for="r in store.locations.remotes"
        :key="r.name"
        :label="r.name"
        :count="r.branches.length"
        nested
        default-open
      >
        <div v-for="branch in r.branches" :key="branch" class="tree-item nested">
          <span class="item-name">{{ branch }}</span>
        </div>
      </TreeSection>
    </TreeSection>

    <TreeSection label="Tags" :count="store.locations.tags.length">
      <div v-for="t in store.locations.tags" :key="t.name" class="tree-item">
        <span class="item-name">{{ t.name }}</span>
        <span v-if="t.date" class="date">{{ t.date }}</span>
      </div>
    </TreeSection>

    <TreeSection label="Stashes" :count="store.locations.stashes.length">
      <div v-for="s in store.locations.stashes" :key="s.index" class="tree-item">
        <span class="item-name">{{ s.label }}</span>
      </div>
    </TreeSection>
  </div>
</template>

<style scoped>
.locations {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-top: 4px;
}

.head-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
}

.head-icon {
  color: var(--accent);
  font-size: 8px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 12px 2px 30px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  transition: background 0.1s;
}

.tree-item.nested {
  padding-left: 30px;
}

.tree-item:hover {
  background: var(--bg-hover);
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge {
  font-size: 10px;
  flex-shrink: 0;
}

.ahead {
  color: var(--accent);
}

.behind {
  color: var(--accent-pink);
}

.tracking {
  color: var(--fg-faint);
  font-size: 11px;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.date {
  color: var(--fg-faint);
  font-size: 11px;
  margin-left: auto;
}
</style>
