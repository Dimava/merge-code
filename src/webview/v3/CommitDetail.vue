<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppStore } from "./store";
import type { CommitDetail, FileChange } from "./plan";

const store = useAppStore();
const detail = computed(() => store.detail);

const expandedFiles = ref<Set<string>>(new Set());

function toggleFile(path: string) {
  const s = new Set(expandedFiles.value);
  if (s.has(path)) s.delete(path);
  else s.add(path);
  expandedFiles.value = s;
}

function modeLabel(mode: string): string {
  switch (mode) {
    case "M": return "modified";
    case "A": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    case "??": return "untracked";
    default: return mode;
  }
}

function modeClass(mode: string): string {
  switch (mode) {
    case "A": case "??": return "mode-add";
    case "D": return "mode-del";
    case "R": return "mode-rename";
    default: return "mode-mod";
  }
}

function statStr(f: FileChange): string {
  if (f.added === -1) return "binary";
  const parts: string[] = [];
  if (f.added > 0) parts.push(`+${f.added}`);
  if (f.deleted > 0) parts.push(`−${f.deleted}`);
  return parts.join(" ") || "0";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function shortHash(h: string): string {
  return h.slice(0, 10);
}

function fileName(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function fileDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i + 1) : "";
}

function allFiles(d: CommitDetail): FileChange[] {
  if (d.workingTree) {
    return [...d.workingTree.staged, ...d.workingTree.unstaged, ...d.workingTree.untracked];
  }
  return d.files;
}
</script>

<template>
  <div class="detail-pane" v-if="detail">
    <div class="commit-header">
      <div class="hash-row">
        <span class="hash">{{ shortHash(detail.hash) }}</span>
        <span v-for="p in detail.parents" :key="p" class="parent-hash">{{ shortHash(p) }}</span>
      </div>

      <div class="author-row">
        <span class="author-name">{{ detail.author.name }}</span>
        <span class="author-email">&lt;{{ detail.author.email }}&gt;</span>
      </div>
      <div class="date-row">{{ formatDate(detail.author.date) }}</div>

      <div
        v-if="detail.committer && detail.committer.name !== detail.author.name"
        class="committer-row"
      >
        Committed by {{ detail.committer.name }}
      </div>

      <div class="body" v-if="detail.body">{{ detail.body }}</div>
    </div>

    <div class="files-section">
      <div class="files-header">
        Files changed
        <span class="files-count">{{ allFiles(detail).length }}</span>
      </div>

      <div
        v-for="f in allFiles(detail)"
        :key="f.path"
        class="file-block"
      >
        <div class="file-row" @click="toggleFile(f.path)">
          <span class="file-chevron" :class="{ open: expandedFiles.has(f.path) }">&#9654;</span>
          <span :class="['file-mode', modeClass(f.mode)]">{{ f.mode === '??' ? 'U' : f.mode }}</span>
          <span class="file-path">
            <span class="file-dir">{{ fileDir(f.path) }}</span>
            <span class="file-name">{{ fileName(f.path) }}</span>
          </span>
          <span class="file-stat">{{ statStr(f) }}</span>
        </div>

        <div v-if="expandedFiles.has(f.path) && f.hunks.length" class="diff-area">
          <div v-for="(hunk, hi) in f.hunks" :key="hi" class="hunk">
            <template v-for="(line, li) in hunk.lines" :key="li">
              <div
                v-if="line.type === 'hunk'"
                class="diff-line diff-hunk"
              >
                <span class="ln ln-old"></span>
                <span class="ln ln-new"></span>
                <span class="diff-text">{{ line.text }}</span>
              </div>
              <div
                v-else
                :class="['diff-line', 'diff-' + line.type]"
              >
                <span class="ln ln-old">{{ line.old ?? '' }}</span>
                <span class="ln ln-new">{{ line.new ?? '' }}</span>
                <span class="diff-text">{{ line.text }}</span>
              </div>
            </template>
          </div>
        </div>

        <div v-if="expandedFiles.has(f.path) && f.content" class="diff-area">
          <div class="diff-line diff-add" v-for="(line, li) in f.content.split('\n')" :key="li">
            <span class="ln ln-old"></span>
            <span class="ln ln-new">{{ li + 1 }}</span>
            <span class="diff-text">{{ line }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="detail-empty" v-else>
    <div class="empty-hint">Select a commit to view details</div>
  </div>
</template>

<style scoped>
.detail-pane {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.detail-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-hint {
  color: var(--fg-faint);
  font-size: 12px;
  font-style: italic;
}

.commit-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hash-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.hash {
  font-family: "Commit Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace;
  font-size: 12px;
  color: var(--accent-blue);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
}

.parent-hash {
  font-family: "Commit Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace;
  font-size: 11px;
  color: var(--fg-dim);
}

.author-row {
  font-size: 12px;
  margin-top: 4px;
}

.author-name {
  color: var(--accent-orange);
  font-weight: 600;
}

.author-email {
  color: var(--fg-dim);
  font-size: 11px;
  margin-left: 4px;
}

.date-row {
  color: var(--fg-muted);
  font-size: 11px;
}

.committer-row {
  color: var(--fg-dim);
  font-size: 11px;
  font-style: italic;
}

.body {
  margin-top: 8px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fg);
  line-height: 1.5;
  font-family: "Commit Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace;
}

.files-section {
  padding-bottom: 32px;
}

.files-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--fg-dim);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-base);
  z-index: 1;
}

.files-count {
  background: var(--bg-elevated);
  color: var(--fg-muted);
  font-size: 10px;
  padding: 0 5px;
  border-radius: 8px;
  line-height: 16px;
  font-weight: 400;
}

.file-block {
  border-bottom: 1px solid var(--border);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.1s;
}

.file-row:hover {
  background: var(--bg-hover);
}

.file-chevron {
  font-size: 8px;
  width: 12px;
  text-align: center;
  flex-shrink: 0;
  color: var(--fg-dim);
  transition: transform 0.15s;
  display: inline-block;
}
.file-chevron.open {
  transform: rotate(90deg);
}

.file-mode {
  font-size: 10px;
  font-weight: 700;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
  font-family: "Commit Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace;
}

.mode-add { color: var(--diff-add-fg); }
.mode-del { color: var(--diff-del-fg); }
.mode-mod { color: var(--accent-blue); }
.mode-rename { color: var(--accent-purple); }

.file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.file-dir {
  color: var(--fg-dim);
}

.file-name {
  color: var(--fg);
}

.file-stat {
  font-family: "Commit Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace;
  font-size: 11px;
  color: var(--fg-dim);
  flex-shrink: 0;
  margin-left: auto;
}

.diff-area {
  background: var(--bg-input);
  border-top: 1px solid var(--border);
  font-family: "Commit Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace;
  font-size: 11px;
  line-height: 1.6;
  overflow-x: auto;
}

.diff-line {
  display: flex;
  white-space: pre;
  min-width: max-content;
}

.diff-ctx {
  color: var(--fg-muted);
}

.diff-add {
  background: var(--diff-add-bg);
  color: var(--diff-add-fg);
}

.diff-del {
  background: var(--diff-del-bg);
  color: var(--diff-del-fg);
}

.diff-hunk {
  background: var(--diff-hunk-bg);
  color: var(--diff-hunk-fg);
  font-style: italic;
}

.ln {
  display: inline-block;
  width: 44px;
  text-align: right;
  padding-right: 8px;
  color: var(--fg-faint);
  flex-shrink: 0;
  user-select: none;
}

.diff-text {
  padding-left: 4px;
  padding-right: 12px;
}
</style>
