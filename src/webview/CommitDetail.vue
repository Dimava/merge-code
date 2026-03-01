<script setup lang="ts">
import { ref, computed, watch } from "vue";

interface FileChange {
  path: string;
  added: number;
  deleted: number;
}

interface DiffLine {
  type: string;
  oldLine?: number;
  newLine?: number;
  text: string;
}

interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface CommitDetailData {
  hash: string;
  tree: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  refs: string[];
  body: string;
  files: FileChange[];
  fileDiffs: Record<string, { hunks: DiffHunk[] }>;
}

const props = defineProps<{
  detail?: CommitDetailData;
}>();

const activeTab = ref<string>("summary");
const expandedFiles = ref<Set<string>>(new Set());

watch(
  () => props.detail?.hash,
  () => {
    activeTab.value = "summary";
    expandedFiles.value = new Set();
  },
);

function toggleFile(path: string) {
  const s = new Set(expandedFiles.value);
  if (s.has(path)) s.delete(path);
  else s.add(path);
  expandedFiles.value = s;
}

function shortHash(h: string): string {
  return h.slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function fileDir(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") + "/";
}

const totalAdded = computed(() =>
  (props.detail?.files ?? []).reduce((s, f) => s + (f.added >= 0 ? f.added : 0), 0),
);
const totalDeleted = computed(() =>
  (props.detail?.files ?? []).reduce((s, f) => s + (f.deleted >= 0 ? f.deleted : 0), 0),
);

const fileTabs = computed(() => {
  if (!props.detail) return [];
  return props.detail.files.map((f) => fileName(f.path));
});
</script>

<template>
  <div class="commit-detail">
    <template v-if="detail">
      <!-- Tabs -->
      <div class="tabs-bar">
        <span
          class="tab"
          :class="{ active: activeTab === 'summary' }"
          @click="activeTab = 'summary'"
          >Summary</span
        >
        <span
          v-for="f in detail.files"
          :key="f.path"
          class="tab"
          :class="{ active: activeTab === f.path }"
          @click="activeTab = f.path"
          >{{ fileName(f.path) }}</span
        >
      </div>

      <!-- Summary tab -->
      <div v-if="activeTab === 'summary'" class="summary-content">
        <div class="fields">
          <div class="field">
            <span class="label">Commit Hash</span>
            <span class="value mono">{{ detail.hash }}</span>
          </div>
          <div class="field">
            <span class="label">Tree</span>
            <span class="value mono">{{ detail.tree }}</span>
          </div>
          <div class="field">
            <span class="label">Author</span>
            <span class="value">{{ detail.authorName }} &lt;{{ detail.authorEmail }}&gt;</span>
          </div>
          <div class="field">
            <span class="label">Date</span>
            <span class="value">{{ formatDate(detail.authorDate) }}</span>
          </div>
          <div v-for="p in detail.parents" :key="p" class="field">
            <span class="label">Parent</span>
            <span class="value mono">{{ p }}</span>
          </div>
          <div class="field">
            <span class="label">Stats</span>
            <span class="value stats-value">
              {{ detail.files.length }} file{{ detail.files.length !== 1 ? "s" : "" }} changed:
              <span class="stat-del">-{{ totalDeleted }}</span>
              <span class="stat-add">+{{ totalAdded }}</span>
            </span>
          </div>
        </div>

        <div class="message">{{ detail.body }}</div>

        <!-- File list with collapsible diffs -->
        <div v-for="f in detail.files" :key="f.path" class="file-section">
          <div class="file-header" @click="toggleFile(f.path)">
            <span class="expand-icon">{{ expandedFiles.has(f.path) ? "\u25BC" : "\u25B6" }}</span>
            <span class="file-path">
              <span class="file-dir">{{ fileDir(f.path) }}</span>
              <span class="file-name">{{ fileName(f.path) }}</span>
            </span>
            <span class="file-stats">
              <span v-if="f.deleted >= 0" class="stat-del">-{{ f.deleted }}</span>
              <span v-if="f.added >= 0" class="stat-add">+{{ f.added }}</span>
              <span v-if="f.added < 0 && f.deleted < 0" class="stat-bin">BIN</span>
            </span>
          </div>
          <div v-if="expandedFiles.has(f.path) && detail.fileDiffs[f.path]" class="diff-view">
            <template v-for="(hunk, hi) in detail.fileDiffs[f.path].hunks" :key="hi">
              <div
                v-for="(line, li) in hunk.lines"
                :key="`${hi}-${li}`"
                class="diff-line"
                :class="line.type"
              >
                <span class="line-no old">{{
                  line.type === "hunk" ? "" : (line.oldLine ?? "")
                }}</span>
                <span class="line-no new">{{
                  line.type === "hunk" ? "" : (line.newLine ?? "")
                }}</span>
                <span class="line-text">{{ line.type === "hunk" ? line.text : line.text }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- File diff tab -->
      <div v-else class="file-diff-content">
        <template v-if="detail.fileDiffs[activeTab]">
          <div v-for="(hunk, hi) in detail.fileDiffs[activeTab].hunks" :key="hi">
            <div
              v-for="(line, li) in hunk.lines"
              :key="`${hi}-${li}`"
              class="diff-line"
              :class="line.type"
            >
              <span class="line-no old">{{
                line.type === "hunk" ? "" : (line.oldLine ?? "")
              }}</span>
              <span class="line-no new">{{
                line.type === "hunk" ? "" : (line.newLine ?? "")
              }}</span>
              <span class="line-text">{{ line.type === "hunk" ? line.text : line.text }}</span>
            </div>
          </div>
        </template>
        <div v-else class="empty">Binary file or no diff available</div>
      </div>
    </template>
    <div v-else class="empty">Select a commit</div>
  </div>
</template>

<style scoped>
.commit-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 12px;
}
.tabs-bar {
  display: flex;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-bar::-webkit-scrollbar {
  display: none;
}
.tab {
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  color: var(--vscode-descriptionForeground);
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}
.tab.active {
  color: var(--vscode-foreground);
  border-bottom-color: var(--vscode-focusBorder, #007acc);
}
.tab:hover {
  color: var(--vscode-foreground);
}
.summary-content {
  flex: 1;
  overflow: auto;
}
.fields {
  padding: 6px 0;
}
.field {
  padding: 1px 12px;
  display: flex;
  gap: 12px;
  line-height: 1.5;
}
.label {
  color: var(--vscode-descriptionForeground);
  min-width: 90px;
  flex-shrink: 0;
  text-align: right;
}
.value {
  flex: 1;
  min-width: 0;
  word-break: break-all;
}
.value.mono {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
}
.stats-value {
  display: flex;
  gap: 6px;
  align-items: center;
}
.stat-add {
  color: #4ec962;
  background: rgba(78, 201, 98, 0.15);
  padding: 0 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
}
.stat-del {
  color: #f14c4c;
  background: rgba(241, 76, 76, 0.15);
  padding: 0 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
}
.stat-bin {
  color: var(--vscode-descriptionForeground);
}
.message {
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-panel-border, #333);
  white-space: pre-wrap;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 13px;
  line-height: 1.4;
}
.file-section {
  border-top: 1px solid var(--vscode-panel-border, #333);
}
.file-header {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
}
.file-header:hover {
  background: var(--vscode-list-hoverBackground);
}
.expand-icon {
  font-size: 9px;
  width: 12px;
  flex-shrink: 0;
  color: var(--vscode-descriptionForeground);
}
.file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-dir {
  color: var(--vscode-descriptionForeground);
}
.file-name {
  font-weight: 500;
}
.file-stats {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}
.diff-view,
.file-diff-content {
  overflow: auto;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 1.45;
}
.file-diff-content {
  flex: 1;
}
.diff-line {
  display: flex;
  white-space: pre;
  min-width: fit-content;
}
.diff-line.add {
  background: rgba(78, 201, 98, 0.12);
}
.diff-line.del {
  background: rgba(241, 76, 76, 0.12);
}
.diff-line.hunk {
  color: var(--vscode-descriptionForeground);
  background: rgba(0, 122, 204, 0.08);
  font-style: italic;
  padding: 2px 0;
}
.line-no {
  display: inline-block;
  width: 40px;
  text-align: right;
  padding-right: 8px;
  color: var(--vscode-editorLineNumber-foreground, #858585);
  flex-shrink: 0;
  user-select: none;
}
.line-text {
  flex: 1;
  padding-left: 4px;
}
.empty {
  padding: 16px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}
</style>
