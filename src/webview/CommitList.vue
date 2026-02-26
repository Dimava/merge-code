<script setup lang="ts">
export interface CommitEntry {
  hash: string;
  short: string;
  subject: string;
  author: string;
  date: string;
  refs: string[];
}

const props = defineProps<{
  commits: CommitEntry[];
  selected?: string;
}>();

const emit = defineEmits<{
  select: [hash: string];
}>();
</script>

<template>
  <div class="commit-list">
    <div class="list-header">Commits</div>
    <div
      v-for="c in commits"
      :key="c.hash"
      class="commit-row"
      :class="{ selected: c.hash === selected }"
      @click="emit('select', c.hash)"
    >
      <div class="commit-top">
        <span class="subject">{{ c.subject }}</span>
        <span v-if="c.refs.length" class="refs">
          <span v-for="r in c.refs" :key="r" class="ref-badge">{{ r }}</span>
        </span>
      </div>
      <div class="commit-bottom">
        <span class="author">{{ c.author }}</span>
        <span class="date">{{ c.date }}</span>
      </div>
    </div>
    <div v-if="commits.length === 0" class="empty">No commits</div>
  </div>
</template>

<style scoped>
.commit-list {
  height: 100%;
  overflow: auto;
}
.list-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-descriptionForeground);
  padding: 8px 12px 4px;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
}
.commit-row {
  padding: 6px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--vscode-panel-border, transparent);
}
.commit-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.commit-row.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}
.commit-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.subject {
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.refs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.ref-badge {
  font-size: 11px;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  white-space: nowrap;
}
.commit-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  margin-top: 2px;
}
.author {
  font-style: italic;
}
.empty {
  padding: 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}
</style>
