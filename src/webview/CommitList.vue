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
    <div class="list-header">
      <span class="tab active">Commits</span>
      <span class="tab">Files</span>
    </div>
    <div class="commits-scroll">
      <div
        v-for="(c, i) in commits"
        :key="c.hash"
        class="commit-row"
        :class="{ selected: c.hash === selected }"
        @click="emit('select', c.hash)"
      >
        <div class="graph-col">
          <div class="graph-line top" />
          <div class="graph-dot" />
          <div v-if="i < commits.length - 1" class="graph-line bottom" />
        </div>
        <div class="commit-content">
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
      </div>
      <div v-if="commits.length === 0" class="empty">No commits</div>
    </div>
  </div>
</template>

<style scoped>
.commit-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-header {
  display: flex;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
  flex-shrink: 0;
}
.tab {
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
  color: var(--vscode-descriptionForeground);
  border-bottom: 2px solid transparent;
}
.tab.active {
  color: var(--vscode-foreground);
  border-bottom-color: var(--vscode-focusBorder, #007acc);
}
.tab:hover {
  color: var(--vscode-foreground);
}
.commits-scroll {
  flex: 1;
  overflow: auto;
}
.commit-row {
  display: flex;
  cursor: pointer;
  min-height: 44px;
}
.commit-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.commit-row.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}
.graph-col {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.graph-line {
  width: 2px;
  flex: 1;
  background: var(--vscode-focusBorder, #007acc);
}
.graph-line.top {
  flex: 1;
}
.graph-line.bottom {
  flex: 1;
}
.graph-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vscode-focusBorder, #007acc);
  flex-shrink: 0;
}
.commit-content {
  flex: 1;
  min-width: 0;
  padding: 4px 8px 4px 0;
}
.commit-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.subject {
  font-weight: 600;
  font-size: 13px;
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
  margin-top: 1px;
}
.commit-row.selected .commit-bottom {
  color: var(--vscode-list-activeSelectionForeground);
  opacity: 0.7;
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
