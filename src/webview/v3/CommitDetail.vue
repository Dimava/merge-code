<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppStore } from "./store";
import type { CommitDetail, FileChange } from "./plan";
import { DiffView, DiffModeEnum } from "@git-diff-view/vue";
import "@git-diff-view/vue/styles/diff-view.css";
import { highlighter } from "@git-diff-view/lowlight";

const store = useAppStore();
const detail = computed(() => store.detail);

const expandedFiles = ref<Set<string>>(new Set());
const collapsedGroups = ref<Set<string>>(new Set());

function toggleFile(key: string) {
  const s = new Set(expandedFiles.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  expandedFiles.value = s;
}

function toggleGroup(prefix: string) {
  const s = new Set(collapsedGroups.value);
  if (s.has(prefix)) s.delete(prefix);
  else s.add(prefix);
  collapsedGroups.value = s;
}

function modeClass(mode: string): string {
  switch (mode) {
    case "A":
    case "??":
      return "mode-add";
    case "D":
      return "mode-del";
    case "R":
      return "mode-rename";
    default:
      return "mode-mod";
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
    return (
      d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
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

function fileLang(path: string): string {
  const ext = path.split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    vue: "vue",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    sh: "bash",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? ext;
}

function diffData(f: FileChange) {
  if (!f.rawDiff) return null;
  return {
    newFile: { fileName: f.path, fileLang: fileLang(f.path) },
    oldFile: { fileName: f.path, fileLang: fileLang(f.path) },
    hunks: [f.rawDiff],
  };
}

interface FileGroup {
  label: string;
  prefix: string;
  files: FileChange[];
}

function fileGroups(d: CommitDetail): FileGroup[] {
  if (d.workingTree) {
    const groups: FileGroup[] = [];
    if (d.workingTree.unstaged.length)
      groups.push({ label: "Unstaged", prefix: "unstaged:", files: d.workingTree.unstaged });
    if (d.workingTree.untracked.length)
      groups.push({ label: "Untracked", prefix: "untracked:", files: d.workingTree.untracked });
    if (d.workingTree.staged.length)
      groups.push({ label: "Staged", prefix: "staged:", files: d.workingTree.staged });
    return groups;
  }
  return [{ label: "Files changed", prefix: "", files: d.files }];
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

    <div v-for="group in fileGroups(detail)" :key="group.prefix" class="files-section">
      <div
        class="files-header"
        :class="{ clickable: group.prefix }"
        @click="group.prefix && toggleGroup(group.prefix)"
      >
        <span
          v-if="group.prefix"
          class="group-chevron"
          :class="{ open: !collapsedGroups.has(group.prefix) }"
          >&#9654;</span
        >
        {{ group.label }}
        <span class="files-count">{{ group.files.length }}</span>
      </div>

      <template v-if="!group.prefix || !collapsedGroups.has(group.prefix)">
        <div v-for="f in group.files" :key="group.prefix + f.path" class="file-block">
          <div class="file-row" @click="toggleFile(group.prefix + f.path)">
            <span class="file-chevron" :class="{ open: expandedFiles.has(group.prefix + f.path) }"
              >&#9654;</span
            >
            <span :class="['file-mode', modeClass(f.mode)]">{{
              f.mode === "??" ? "U" : f.mode
            }}</span>
            <span class="file-path">
              <span class="file-dir">{{ fileDir(f.path) }}</span>
              <span class="file-name">{{ fileName(f.path) }}</span>
            </span>
            <span class="file-stat">{{ statStr(f) }}</span>
          </div>

          <div v-if="expandedFiles.has(group.prefix + f.path) && diffData(f)" class="diff-area">
            <DiffView
              :data="diffData(f)!"
              :diff-view-mode="DiffModeEnum.Unified"
              :diff-view-theme="store.theme"
              :diff-view-font-size="12"
              :diff-view-wrap="true"
              :diff-view-highlight="true"
              :register-highlighter="highlighter"
            />
          </div>

          <div
            v-if="expandedFiles.has(group.prefix + f.path) && !diffData(f) && f.content"
            class="diff-area"
          >
            <div class="diff-line diff-add" v-for="(line, li) in f.content.split('\n')" :key="li">
              <span class="ln ln-old"></span>
              <span class="ln ln-new">{{ li + 1 }}</span>
              <span class="diff-text">{{ line }}</span>
            </div>
          </div>
        </div>
      </template>
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

.files-section:last-child {
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
.files-header.clickable {
  cursor: pointer;
  user-select: none;
}
.files-header.clickable:hover {
  background: var(--bg-hover);
}

.group-chevron {
  font-size: 8px;
  width: 12px;
  text-align: center;
  flex-shrink: 0;
  color: var(--fg-dim);
  transition: transform 0.15s;
  display: inline-block;
  transform: rotate(0deg);
}
.group-chevron.open {
  transform: rotate(90deg);
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

.mode-add {
  color: var(--diff-add-fg);
}
.mode-del {
  color: var(--diff-del-fg);
}
.mode-mod {
  color: var(--accent-blue);
}
.mode-rename {
  color: var(--accent-purple);
}

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
  border-top: 1px solid var(--border);
  overflow-x: auto;
}

.diff-line {
  display: flex;
  white-space: pre;
  min-width: max-content;
  font-family: "Commit Mono", "SF Mono", "Cascadia Code", "Fira Code", monospace;
  font-size: 11px;
  line-height: 1.6;
}

.diff-add {
  background: var(--diff-add-bg);
  color: var(--diff-add-fg);
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
