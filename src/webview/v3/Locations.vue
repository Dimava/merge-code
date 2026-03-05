<script setup lang="ts">
import { locations } from "./store";
import TreeSection from "./TreeSection.vue";
</script>

<template>
  <div class="locations">
    <div class="head-bar" v-if="locations.head">
      <span class="head-icon">&#9679;</span>
      {{ locations.head }}
    </div>

    <TreeSection label="Branches" :count="locations.branches.length" default-open>
      <div
        v-for="b in locations.branches"
        :key="b.name"
        class="tree-item"
      >
        <span class="item-name">{{ b.name }}</span>
        <span v-if="b.ahead || b.behind" class="badge">
          <span v-if="b.ahead" class="ahead">{{ b.ahead }}&#8593;</span>
          <span v-if="b.behind" class="behind">{{ b.behind }}&#8595;</span>
        </span>
        <span v-if="b.tracking" class="tracking">{{ b.tracking }}</span>
      </div>
    </TreeSection>

    <TreeSection label="Remotes" :count="locations.remotes.length" default-open>
      <TreeSection
        v-for="r in locations.remotes"
        :key="r.name"
        :label="r.name"
        :count="r.branches.length"
        nested
        default-open
      >
        <div
          v-for="branch in r.branches"
          :key="branch"
          class="tree-item nested"
        >
          <span class="item-name">{{ branch }}</span>
        </div>
      </TreeSection>
    </TreeSection>

    <TreeSection label="Tags" :count="locations.tags.length">
      <div
        v-for="t in locations.tags"
        :key="t.name"
        class="tree-item"
      >
        <span class="item-name">{{ t.name }}</span>
        <span v-if="t.date" class="date">{{ t.date }}</span>
      </div>
    </TreeSection>

    <TreeSection label="Stashes" :count="locations.stashes.length">
      <div
        v-for="s in locations.stashes"
        :key="s.index"
        class="tree-item"
      >
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
  color: #e0e0e0;
}

.head-icon {
  color: #6bc5f8;
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
}

.tree-item.nested {
  padding-left: 46px;
}

.tree-item:hover {
  background: #2a2d2e;
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
  color: #a9dc76;
}

.behind {
  color: #fc6d7b;
}

.tracking {
  color: #666;
  font-size: 11px;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.date {
  color: #666;
  font-size: 11px;
  margin-left: auto;
}
</style>
