<script setup lang="ts">
import { ref, computed, watch } from "vue";

interface FileChange {
  path: string;
  added: number;
  deleted: number;
  mode: string;
  content?: string;
  hunks?: {
    combined?: DiffHunk[];
    staged?: DiffHunk[];
    unstaged?: DiffHunk[];
  };
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
  workingTreeChanges?: {
    staged: FileChange[];
    unstaged: FileChange[];
    untracked: FileChange[];
  };
}

const props = defineProps<{
  detail?: CommitDetailData;
}>();

const expandedFiles = ref<Set<string>>(new Set());
const commitMessageDraft = ref("");
type Bucket = "staged" | "unstaged" | "untracked" | "combined";

watch(
  () => props.detail?.hash,
  () => {
    expandedFiles.value = new Set();
    commitMessageDraft.value = props.detail?.body ?? "";
  },
);

function toggleFile(path: string) {
  const s = new Set(expandedFiles.value);
  if (s.has(path)) s.delete(path);
  else s.add(path);
  expandedFiles.value = s;
}

function expandKey(bucket: Bucket, path: string): string {
  return bucket === "combined" ? path : `${bucket}:${path}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
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

function modeLabel(mode: string): string {
  if (mode === "??") return "??";
  return mode.split(/\s+/)[0] ?? mode;
}

const totalAdded = computed(() =>
  (props.detail?.files ?? []).reduce((s, f) => s + (f.added >= 0 ? f.added : 0), 0),
);
const totalDeleted = computed(() =>
  (props.detail?.files ?? []).reduce((s, f) => s + (f.deleted >= 0 ? f.deleted : 0), 0),
);

const isUncommitted = computed(() => props.detail?.hash === "__uncommitted__");
const sectionTitle = computed(() => (isUncommitted.value ? "Working Directory" : "Files Changed"));
const stagedChanges = computed(() => props.detail?.workingTreeChanges?.staged ?? []);
const unstagedChanges = computed(() => props.detail?.workingTreeChanges?.unstaged ?? []);
const untrackedChanges = computed(() => props.detail?.workingTreeChanges?.untracked ?? []);
const groupedBuckets = computed(() => [
  { id: "unstaged" as const, title: "Unstaged", empty: "No unstaged files", files: unstagedChanges.value },
  { id: "untracked" as const, title: "Untracked", empty: "No untracked files", files: untrackedChanges.value },
  { id: "staged" as const, title: "Staged", empty: "No staged files", files: stagedChanges.value },
]);

function bucketHunks(f: FileChange, bucket: Bucket): DiffHunk[] {
  if (bucket === "staged") return f.hunks?.staged ?? [];
  if (bucket === "unstaged") return f.hunks?.unstaged ?? [];
  return f.hunks?.combined ?? [];
}

function noopAction(_action: string, _bucket?: Bucket, _path?: string) {
  // Placeholder for future stage/discard handlers.
}

function onMessageInput(e: Event) {
  commitMessageDraft.value = (e.target as HTMLElement).innerText;
}
</script>

<template>
  <div class="commit-detail">
    <template v-if="detail">
      <div class="summary-content">
        <div class="summary-top">
          <div class="meta-block">
            <div class="meta-label">Commit Message</div>
            <div
              v-if="isUncommitted"
              class="commit-message-input"
              contenteditable="true"
              spellcheck="true"
              @input="onMessageInput"
              >{{ commitMessageDraft }}</div
            >
            <div v-else class="commit-message-readonly">
              {{ detail.body || "(no message)" }}
            </div>
            <div class="commit-actions">
              <button class="inline-action commit-btn" @click.stop="noopAction('commit')">Commit</button>
            </div>
            <div class="meta-line">
              {{ detail.authorName || "Unknown author" }}<template v-if="detail.authorEmail">
                &lt;{{ detail.authorEmail }}&gt;
              </template>
            </div>
            <div v-if="formatDate(detail.authorDate)" class="meta-line muted">
              {{ formatDate(detail.authorDate) }}
            </div>
            <div v-if="!isUncommitted" class="meta-line mono muted">Commit {{ detail.hash }}</div>
          </div>
        </div>

        <div class="summary-scroll">
          <div class="section-title">{{ sectionTitle }}</div>
          <div class="section-stats">
            {{ detail.files.length }} file{{ detail.files.length !== 1 ? "s" : "" }}:
            <span class="stat-add">+{{ totalAdded }}</span>
            <span class="stat-del">-{{ totalDeleted }}</span>
          </div>

          <div v-if="isUncommitted" class="change-groups">
            <div v-for="g in groupedBuckets" :key="g.id" class="change-group">
              <div class="group-title">
                <span>{{ g.title }} ({{ g.files.length }})</span>
                <span class="group-actions">
                  <button class="inline-action" @click.stop="noopAction('discardAll', g.id)">
                    Discard All
                  </button>
                  <button class="inline-action" @click.stop="noopAction('stageAll', g.id)">
                    Stage All
                  </button>
                </span>
              </div>
              <div v-if="g.files.length === 0" class="group-empty">{{ g.empty }}</div>
              <div v-for="f in g.files" :key="`${g.id}-${f.path}`" class="file-section in-group">
                <div class="file-header" @click="toggleFile(expandKey(g.id, f.path))">
                  <span class="expand-icon">{{
                    expandedFiles.has(expandKey(g.id, f.path)) ? "\u25BC" : "\u25B6"
                  }}</span>
                  <span class="file-path">
                    <span class="file-dir">{{ fileDir(f.path) }}</span>
                    <span class="file-name">{{ fileName(f.path) }}</span>
                  </span>
                  <span class="file-stats">
                    <span class="mode-badge">{{ modeLabel(f.mode) }}</span>
                    <span v-if="f.deleted >= 0" class="stat-del">-{{ f.deleted }}</span>
                    <span v-if="f.added >= 0" class="stat-add">+{{ f.added }}</span>
                    <span v-if="f.added < 0 && f.deleted < 0" class="stat-bin">BIN</span>
                  </span>
                  <span class="file-actions">
                    <button class="inline-action" @click.stop="noopAction('discard', g.id, f.path)">
                      Discard
                    </button>
                    <button class="inline-action" @click.stop="noopAction('stage', g.id, f.path)">
                      Stage
                    </button>
                  </span>
                </div>
                <div v-if="expandedFiles.has(expandKey(g.id, f.path))" class="diff-view">
                  <template v-for="(hunk, hi) in bucketHunks(f, g.id)" :key="`${g.id}-${hi}`">
                    <div
                      v-for="(line, li) in hunk.lines"
                      :key="`${g.id}-${hi}-${li}`"
                      class="diff-line"
                      :class="line.type"
                    >
                      <span class="line-no old">{{
                        line.type === "hunk" ? "" : (line.oldLine ?? "")
                      }}</span>
                      <span class="line-no new">{{
                        line.type === "hunk" ? "" : (line.newLine ?? "")
                      }}</span>
                      <span class="line-text">{{ line.text }}</span>
                      <span v-if="line.type === 'hunk'" class="hunk-actions">
                        <button
                          class="hunk-action-btn"
                          @click.stop="noopAction('discardHunk', g.id, `${f.path}#${hi}`)"
                        >
                          Discard Hunk
                        </button>
                        <button
                          class="hunk-action-btn"
                          @click.stop="noopAction('stageHunk', g.id, `${f.path}#${hi}`)"
                        >
                          Stage Hunk
                        </button>
                      </span>
                    </div>
                  </template>
                  <pre
                    v-if="bucketHunks(f, g.id).length === 0 && g.id === 'untracked' && f.content != null"
                    class="file-content"
                    >{{ f.content }}</pre
                  >
                  <div v-else-if="bucketHunks(f, g.id).length === 0" class="group-empty">
                    Binary file or no diff available
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-for="f in isUncommitted ? [] : detail.files" :key="f.path" class="file-section">
            <div class="file-header" @click="toggleFile(f.path)">
              <span class="expand-icon">{{ expandedFiles.has(f.path) ? "\u25BC" : "\u25B6" }}</span>
              <span class="file-path">
                <span class="file-dir">{{ fileDir(f.path) }}</span>
                <span class="file-name">{{ fileName(f.path) }}</span>
              </span>
              <span class="file-stats">
                <span class="mode-badge">{{ modeLabel(f.mode) }}</span>
                <span v-if="f.deleted >= 0" class="stat-del">-{{ f.deleted }}</span>
                <span v-if="f.added >= 0" class="stat-add">+{{ f.added }}</span>
                <span v-if="f.added < 0 && f.deleted < 0" class="stat-bin">BIN</span>
              </span>
            </div>
            <div v-if="expandedFiles.has(f.path)" class="diff-view">
              <div v-if="f.hunks?.staged?.length" class="hunk-group-title">Staged</div>
              <template v-for="(hunk, hi) in f.hunks?.staged ?? []" :key="`s-${hi}`">
                <div
                  v-for="(line, li) in hunk.lines"
                  :key="`s-${hi}-${li}`"
                  class="diff-line"
                  :class="line.type"
                >
                  <span class="line-no old">{{ line.type === "hunk" ? "" : (line.oldLine ?? "") }}</span>
                  <span class="line-no new">{{ line.type === "hunk" ? "" : (line.newLine ?? "") }}</span>
                  <span class="line-text">{{ line.text }}</span>
                  <span v-if="line.type === 'hunk'" class="hunk-actions">
                    <button
                      class="hunk-action-btn"
                      @click.stop="noopAction('discardHunk', 'staged', `${f.path}#${hi}`)"
                    >
                      Discard Hunk
                    </button>
                    <button
                      class="hunk-action-btn"
                      @click.stop="noopAction('stageHunk', 'staged', `${f.path}#${hi}`)"
                    >
                      Stage Hunk
                    </button>
                  </span>
                </div>
              </template>

              <div v-if="f.hunks?.unstaged?.length" class="hunk-group-title">Unstaged</div>
              <template v-for="(hunk, hi) in f.hunks?.unstaged ?? []" :key="`u-${hi}`">
                <div
                  v-for="(line, li) in hunk.lines"
                  :key="`u-${hi}-${li}`"
                  class="diff-line"
                  :class="line.type"
                >
                  <span class="line-no old">{{ line.type === "hunk" ? "" : (line.oldLine ?? "") }}</span>
                  <span class="line-no new">{{ line.type === "hunk" ? "" : (line.newLine ?? "") }}</span>
                  <span class="line-text">{{ line.text }}</span>
                  <span v-if="line.type === 'hunk'" class="hunk-actions">
                    <button
                      class="hunk-action-btn"
                      @click.stop="noopAction('discardHunk', 'unstaged', `${f.path}#${hi}`)"
                    >
                      Discard Hunk
                    </button>
                    <button
                      class="hunk-action-btn"
                      @click.stop="noopAction('stageHunk', 'unstaged', `${f.path}#${hi}`)"
                    >
                      Stage Hunk
                    </button>
                  </span>
                </div>
              </template>

              <template v-for="(hunk, hi) in f.hunks?.combined ?? []" :key="`c-${hi}`">
                <div
                  v-for="(line, li) in hunk.lines"
                  :key="`c-${hi}-${li}`"
                  class="diff-line"
                  :class="line.type"
                >
                  <span class="line-no old">{{
                    line.type === "hunk" ? "" : (line.oldLine ?? "")
                  }}</span>
                  <span class="line-no new">{{
                    line.type === "hunk" ? "" : (line.newLine ?? "")
                  }}</span>
                  <span class="line-text">{{ line.text }}</span>
                  <span v-if="line.type === 'hunk'" class="hunk-actions">
                    <button
                      class="hunk-action-btn"
                      @click.stop="noopAction('discardHunk', 'combined', `${f.path}#${hi}`)"
                    >
                      Discard Hunk
                    </button>
                    <button
                      class="hunk-action-btn"
                      @click.stop="noopAction('stageHunk', 'combined', `${f.path}#${hi}`)"
                    >
                      Stage Hunk
                    </button>
                  </span>
                </div>
              </template>
              <pre
                v-if="
                  !(f.hunks?.combined?.length || f.hunks?.staged?.length || f.hunks?.unstaged?.length) &&
                  f.content != null
                "
                class="file-content"
                >{{ f.content }}</pre
              >
              <div
                v-else-if="
                  !(f.hunks?.combined?.length || f.hunks?.staged?.length || f.hunks?.unstaged?.length)
                "
                class="group-empty"
              >
                Binary file or no diff available
              </div>
            </div>
          </div>
        </div>
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
.summary-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.summary-top {
  flex-shrink: 0;
}
.summary-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.meta-block {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
}
.meta-label {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}
.meta-line {
  margin-top: 3px;
}
.commit-message-input {
  width: 100%;
  min-height: 64px;
  max-height: 120px;
  box-sizing: border-box;
  margin-bottom: 6px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 1.35;
  color: var(--vscode-input-foreground, var(--vscode-foreground));
  background: var(--vscode-input-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #555));
  border-radius: 4px;
  padding: 6px 8px;
  overflow: auto;
  white-space: pre-wrap;
}
.commit-message-readonly {
  width: 100%;
  min-height: 64px;
  box-sizing: border-box;
  margin-bottom: 6px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 1.35;
  color: var(--vscode-foreground);
  background: color-mix(in srgb, var(--vscode-editor-background) 93%, var(--vscode-foreground) 7%);
  border: 1px solid var(--vscode-panel-border, #555);
  border-radius: 4px;
  padding: 6px 8px;
  white-space: pre-wrap;
}
.commit-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}
.commit-btn {
  min-width: 84px;
}
.muted {
  color: var(--vscode-descriptionForeground);
}
.mono {
  font-family: var(--vscode-editor-font-family, monospace);
}
.section-title {
  padding: 8px 12px 2px;
  font-size: 12px;
  font-weight: 600;
}
.section-stats {
  padding: 0 12px 8px;
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--vscode-descriptionForeground);
}
.change-groups {
  margin: 0 12px 10px;
  border: 1px solid var(--vscode-panel-border, #333);
  border-radius: 4px;
  overflow: hidden;
}
.change-group + .change-group {
  border-top: 1px solid var(--vscode-panel-border, #333);
}
.group-title {
  padding: 6px 8px;
  font-weight: 600;
  background: color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-foreground) 15%);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.group-actions {
  display: flex;
  gap: 6px;
}
.group-empty {
  padding: 4px 8px 6px;
  color: var(--vscode-descriptionForeground);
}
.group-file {
  padding: 2px 8px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
}
.hunk-group-title {
  padding: 6px 8px 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
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
.file-section {
  border-top: 1px solid var(--vscode-panel-border, #333);
}
.file-section.in-group {
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
  align-items: center;
}
.file-actions {
  display: flex;
  gap: 6px;
  margin-left: 8px;
}
.inline-action {
  height: 20px;
  min-width: 64px;
  padding: 0 8px;
  border: 1px solid var(--vscode-button-border, var(--vscode-panel-border, #555));
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
.inline-action:hover {
  background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
}
.mode-badge {
  color: var(--vscode-descriptionForeground);
  border: 1px solid var(--vscode-panel-border, #555);
  border-radius: 3px;
  padding: 0 4px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 10px;
}
.diff-view,
.file-diff-content {
  overflow: auto;
  scrollbar-gutter: stable;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 1.45;
}
.diff-line {
  display: flex;
  white-space: pre;
  min-width: fit-content;
}
.file-content {
  margin: 0;
  padding: 8px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 1.45;
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
.hunk-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
  padding-right: 8px;
}
.hunk-action-btn {
  height: 18px;
  min-width: 72px;
  padding: 0 6px;
  border: 1px solid var(--vscode-button-border, var(--vscode-panel-border, #555));
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border-radius: 3px;
  font-size: 10px;
  font-style: normal;
  cursor: pointer;
}
.hunk-action-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
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
