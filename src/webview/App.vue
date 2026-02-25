<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import LocationsTree from "./LocationsTree.vue";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

const repoPath = ref("");
const head = ref("");
const branches = ref<{ name: string; commit?: string }[]>([]);
const remotes = ref<{ name: string; url: string; refs: { name: string; commit?: string }[] }[]>([]);
const tags = ref<{ name: string; commit?: string }[]>([]);
const stashes = ref<{ label: string; index: number }[]>([]);
const submodules = ref<{ name: string; path: string }[]>([]);

onMounted(() => {
  window.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "locations") {
      repoPath.value = msg.repoPath;
      head.value = msg.head;
      branches.value = msg.branches;
      remotes.value = msg.remotes;
      tags.value = msg.tags;
      stashes.value = msg.stashes;
      submodules.value = msg.submodules;
    }
  });
  vscode.postMessage({ type: "ready" });
});

const repoName = computed(() => {
  const parts = repoPath.value.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? "";
});
</script>

<template>
  <div class="root">
    <header class="header">
      <span class="repo-name">{{ repoName }}</span>
      <span class="head-name">{{ head }}</span>
    </header>
    <div class="locations">
      <h2 class="locations-title">Locations</h2>
      <LocationsTree label="BRANCHES" :count="branches.length" default-open>
        <div v-for="b in branches" :key="b.name" class="tree-leaf" :class="{ current: b.name === head }">
          <span class="leaf-icon">&#9679;</span>
          {{ b.name }}
          <span v-if="b.name === head" class="current-badge">HEAD</span>
        </div>
      </LocationsTree>
      <LocationsTree label="REMOTES" :count="remotes.length">
        <LocationsTree v-for="r in remotes" :key="r.name" :label="r.name" :count="r.refs.length" :description="r.url" nested>
          <div v-for="ref in r.refs" :key="ref.name" class="tree-leaf">
            {{ ref.name }}
          </div>
        </LocationsTree>
      </LocationsTree>
      <LocationsTree label="TAGS" :count="tags.length">
        <div v-for="t in tags" :key="t.name" class="tree-leaf">
          {{ t.name }}
        </div>
      </LocationsTree>
      <LocationsTree label="STASHES" :count="stashes.length">
        <div v-for="s in stashes" :key="s.index" class="tree-leaf">
          {{ s.label }}
        </div>
      </LocationsTree>
      <LocationsTree label="SUBMODULES" :count="submodules.length">
        <div v-for="s in submodules" :key="s.name" class="tree-leaf">
          {{ s.name }}
          <span class="description">{{ s.path }}</span>
        </div>
      </LocationsTree>
    </div>
  </div>
</template>

<style scoped>
.root {
  font-family: var(--vscode-font-family, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  min-height: 100vh;
  padding: 0;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
}
.repo-name {
  font-weight: 600;
}
.head-name {
  color: var(--vscode-textLink-foreground);
}
.locations {
  padding: 8px 0;
}
.locations-title {
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-descriptionForeground);
  padding: 4px 12px;
  margin: 0;
}
.tree-leaf {
  padding: 2px 12px 2px 28px;
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
  color: var(--vscode-textLink-foreground);
  font-weight: 600;
}
.leaf-icon {
  font-size: 8px;
  opacity: 0.6;
}
.current-badge {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}
.description {
  color: var(--vscode-descriptionForeground);
  margin-left: auto;
}
</style>
