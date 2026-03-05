<script setup lang="ts">
import { repos, activeRepo, switchRepo } from "./store";
</script>

<template>
  <div class="repo-tabs" v-if="repos.length > 1">
    <button
      v-for="r in repos"
      :key="r.id"
      :class="['tab', { active: r.id === activeRepo }]"
      @click="switchRepo(r.id)"
    >
      {{ r.name }}
    </button>
  </div>
</template>

<style scoped>
.repo-tabs {
  display: flex;
  gap: 0;
  background: #181818;
  border-bottom: 1px solid #333;
  overflow-x: auto;
  flex-shrink: 0;
}

.tab {
  padding: 4px 12px;
  font-size: 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #888;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.tab:hover {
  color: #ccc;
  background: #252525;
}

.tab.active {
  color: #e0e0e0;
  border-bottom-color: #6bc5f8;
}
</style>
