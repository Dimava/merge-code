<script setup lang="ts">
import type { CommitEntry } from "./CommitList.vue";

const props = defineProps<{
  commit?: CommitEntry;
}>();
</script>

<template>
  <div class="commit-detail">
    <div class="detail-header">Summary</div>
    <template v-if="commit">
      <div class="field">
        <span class="label">Commit</span>
        <span class="value mono">{{ commit.hash }}</span>
      </div>
      <div class="field">
        <span class="label">Author</span>
        <span class="value">{{ commit.author }}</span>
      </div>
      <div class="field">
        <span class="label">Date</span>
        <span class="value">{{ commit.date }}</span>
      </div>
      <div v-if="commit.refs.length" class="field">
        <span class="label">Refs</span>
        <span class="value">
          <span v-for="r in commit.refs" :key="r" class="ref-badge">{{ r }}</span>
        </span>
      </div>
      <div class="message">{{ commit.subject }}</div>
    </template>
    <div v-else class="empty">Select a commit</div>
  </div>
</template>

<style scoped>
.commit-detail {
  height: 100%;
  overflow: auto;
}
.detail-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-descriptionForeground);
  padding: 8px 12px 4px;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
}
.field {
  padding: 4px 12px;
  display: flex;
  gap: 8px;
}
.label {
  color: var(--vscode-descriptionForeground);
  min-width: 60px;
  font-size: 12px;
}
.value {
  flex: 1;
  word-break: break-all;
}
.value.mono {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
}
.ref-badge {
  font-size: 11px;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  margin-right: 4px;
}
.message {
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-panel-border, #333);
  margin-top: 4px;
  white-space: pre-wrap;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 13px;
}
.empty {
  padding: 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}
</style>
