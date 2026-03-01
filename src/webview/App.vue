<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, reactive, watch, getCurrentInstance } from "vue";
import SplitPane from "./SplitPane.vue";
import LocationsTree from "./LocationsTree.vue";
import RefTree from "./RefTree.vue";
import CommitList from "./CommitList.vue";
import CommitDetail from "./CommitDetail.vue";
import ContextMenu from "./ContextMenu.vue";
import type { RefEntry } from "./RefTree.vue";
import type { CommitEntry } from "./CommitList.vue";
import type { CommitDetailData } from "./CommitDetail.vue";
import type { MenuItem } from "./ContextMenu.vue";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

const repoPath = ref("");
const head = ref("");
const branches = ref<RefEntry[]>([]);
const remotes = ref<{ name: string; url: string; refs: RefEntry[] }[]>([]);
const tags = ref<RefEntry[]>([]);
const stashes = ref<{ label: string; index: number }[]>([]);
const submodules = ref<{ name: string; path: string }[]>([]);
const commits = ref<CommitEntry[]>([]);
const selectedCommit = ref<string>();
const commitDetail = ref<CommitDetailData>();

// Hidden config (category flags + targeted patterns)
const hiddenBranches = ref<Set<string>>(new Set());
const hiddenRemotes = ref<Map<string, Set<string>>>(new Map());
const hiddenTags = ref<Set<string>>(new Set());
const hideBranchesCategory = ref(false);
const hideRemotesCategory = ref(false);
const hideRemoteCategories = ref<Map<string, boolean>>(new Map());
const hideTagsCategory = ref(false);
const hideStashesCategory = ref(false);
const customHideTargets = ref<string[]>([]);
const hiddenResetKey = ref(0);

// Pinned refs tracking (persisted via extension host)
const pinnedBranches = ref<string[]>([]);
const pinnedRemotePins = ref<Record<string, string[]>>({});
const pinnedTags = ref<string[]>([]);

function webviewLog(message: string, data?: unknown, level: "info" | "warn" | "error" = "info") {
  const payload = { type: "webviewLog", level, message, data: toCloneSafe(data) };
  try {
    vscode.postMessage(payload);
  } catch (err) {
    // Never let diagnostics crash the UI.
    try {
      vscode.postMessage({
        type: "webviewLog",
        level: "error",
        message: "webviewLog:postMessage-failed",
        data: {
          originalMessage: message,
          error: String(err),
        },
      });
    } catch {
      // Swallow completely as a last resort.
    }
  }
}

function toCloneSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const replacer = (_key: string, v: unknown) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (v instanceof Error) {
        return {
          name: v.name,
          message: v.message,
          stack: v.stack,
        };
      }
      if (v instanceof Set) return { type: "Set", values: [...v] };
      if (v instanceof Map) return { type: "Map", entries: [...v.entries()] };
    }
    if (typeof v === "function") return `[Function ${(v as Function).name || "anonymous"}]`;
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "bigint") return v.toString();
    return v;
  };
  try {
    return JSON.parse(JSON.stringify(value, replacer)) as unknown;
  } catch {
    return String(value);
  }
}

function onWindowError(event: ErrorEvent) {
  webviewLog(
    "window:error",
    {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    },
    "error",
  );
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  let reason: unknown = event.reason;
  if (reason instanceof Error) {
    reason = { message: reason.message, stack: reason.stack };
  }
  webviewLog("window:unhandledrejection", { reason }, "error");
}

function onComponentLog(event: Event) {
  const detail = (event as CustomEvent).detail as
    | { message?: string; data?: unknown; level?: "info" | "warn" | "error"; source?: string }
    | undefined;
  if (!detail?.message) return;
  webviewLog(
    `${detail.source ?? "component"}:${detail.message}`,
    detail.data,
    detail.level ?? "info",
  );
}

const instance = getCurrentInstance();
if (instance) {
  const config = instance.appContext.config;
  const prevErrorHandler = config.errorHandler;
  const prevWarnHandler = config.warnHandler;
  config.errorHandler = (err, vm, info) => {
    const vmType = (vm as unknown as { type?: { name?: unknown } } | null)?.type;
    const componentName =
      vmType && typeof vmType === "object" && "name" in vmType
        ? String(vmType.name ?? "anonymous")
        : "unknown";
    const payload = {
      info,
      componentName,
      errString: String(err),
      message:
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : undefined,
      stack:
        typeof err === "object" &&
        err !== null &&
        "stack" in err &&
        typeof (err as { stack?: unknown }).stack === "string"
          ? (err as { stack: string }).stack
          : undefined,
      err,
    };
    webviewLog("vue:errorHandler", payload, "error");
    prevErrorHandler?.(err, vm, info);
  };
  config.warnHandler = (msg, vm, trace) => {
    const vmType = (vm as unknown as { type?: { name?: unknown } } | null)?.type;
    const componentName =
      vmType && typeof vmType === "object" && "name" in vmType
        ? String(vmType.name ?? "anonymous")
        : "unknown";
    webviewLog("vue:warnHandler", { msg, trace, componentName }, "warn");
    prevWarnHandler?.(msg, vm, trace);
  };
}

function onBranchHidden(hidden: Set<string>) {
  hiddenBranches.value = hidden;
  sendHideConfig();
}

function onRemoteHidden(remoteName: string, hidden: Set<string>) {
  hiddenRemotes.value = new Map(hiddenRemotes.value).set(remoteName, hidden);
  sendHideConfig();
}

function onTagHidden(hidden: Set<string>) {
  hiddenTags.value = hidden;
  sendHideConfig();
}

function buildTargetPatterns(): string[] {
  const targets = new Set<string>();
  for (const [remote, hidden] of hiddenRemotes.value) {
    for (const name of hidden) targets.add(`remote:${remote}/${name}`);
  }
  for (const name of hiddenBranches.value) targets.add(`branch:${name}`);
  for (const name of hiddenTags.value) targets.add(`tag:${name}`);
  for (const pattern of customHideTargets.value) {
    const trimmed = pattern.trim();
    if (trimmed) targets.add(trimmed);
  }
  return [...targets];
}

function buildRemoteCategoryMap(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [name, hidden] of hideRemoteCategories.value) out[name] = hidden;
  return out;
}

function sendHideConfig() {
  vscode.postMessage({
    type: "setHideConfig",
    hide: {
      categories: {
        branches: hideBranchesCategory.value,
        remotes: hideRemotesCategory.value,
        remoteCategories: buildRemoteCategoryMap(),
        tags: hideTagsCategory.value,
        stashes: hideStashesCategory.value,
      },
      targets: buildTargetPatterns(),
    },
  });
}

function resetAllHiddenRefs() {
  hiddenBranches.value = new Set();
  hiddenRemotes.value = new Map();
  hiddenTags.value = new Set();
  hideBranchesCategory.value = false;
  hideRemotesCategory.value = false;
  hideRemoteCategories.value = new Map();
  hideTagsCategory.value = false;
  hideStashesCategory.value = false;
  customHideTargets.value = [];
  hiddenResetKey.value += 1;
  sendHideConfig();
}

function sendPinnedRefs() {
  vscode.postMessage({
    type: "setPinnedRefs",
    pinned: {
      branches: pinnedBranches.value,
      remotes: pinnedRemotePins.value,
      tags: pinnedTags.value,
    },
  });
}

function onBranchPinned(pinned: Set<string>) {
  pinnedBranches.value = [...pinned];
  sendPinnedRefs();
}

function onRemotePinned(remoteName: string, pinned: Set<string>) {
  pinnedRemotePins.value = { ...pinnedRemotePins.value, [remoteName]: [...pinned] };
  sendPinnedRefs();
}

function onTagPinned(pinned: Set<string>) {
  pinnedTags.value = [...pinned];
  sendPinnedRefs();
}

// Section-level eye toggles
const allBranchesHidden = computed(
  () =>
    hideBranchesCategory.value ||
    (branches.value.length > 0 && branches.value.every((b) => hiddenBranches.value.has(b.name))),
);
const allRemotesHidden = computed(() => {
  if (hideRemotesCategory.value) return true;
  for (const r of remotes.value) {
    if (hideRemoteCategories.value.get(r.name)) continue;
    const h = hiddenRemotes.value.get(r.name);
    if (!h || r.refs.some((ref) => !h.has(ref.name))) return false;
  }
  return remotes.value.length > 0;
});
const allTagsHidden = computed(
  () =>
    hideTagsCategory.value ||
    (tags.value.length > 0 && tags.value.every((t) => hiddenTags.value.has(t.name))),
);
const allStashesHidden = computed(() => hideStashesCategory.value);

function isRemoteCategoryHidden(name: string): boolean {
  return hideRemotesCategory.value || hideRemoteCategories.value.get(name) === true;
}

function toggleAllBranches() {
  hideBranchesCategory.value = !hideBranchesCategory.value;
  sendHideConfig();
}

function toggleAllRemotes() {
  hideRemotesCategory.value = !hideRemotesCategory.value;
  sendHideConfig();
}

function toggleAllTags() {
  hideTagsCategory.value = !hideTagsCategory.value;
  sendHideConfig();
}

function toggleAllStashes() {
  hideStashesCategory.value = !hideStashesCategory.value;
  sendHideConfig();
}

function toggleRemoteCategory(name: string) {
  const m = new Map(hideRemoteCategories.value);
  m.set(name, !(m.get(name) ?? false));
  hideRemoteCategories.value = m;
  sendHideConfig();
}

const focusHash = ref<string>();

function selectCommit(hash: string) {
  selectedCommit.value = hash;
  commitDetail.value = undefined;
  vscode.postMessage({ type: "selectCommit", hash });
}

function focusBranchCommit(entry: { name: string; commit?: string }) {
  if (!entry.commit) return;
  // Find full hash from short hash
  const match = commits.value.find((c) => c.hash.startsWith(entry.commit!));
  if (match) {
    selectedCommit.value = match.hash;
    focusHash.value = match.hash;
    commitDetail.value = undefined;
    vscode.postMessage({ type: "selectCommit", hash: match.hash });
  }
}

// Context menu state
const menu = reactive({
  show: false,
  x: 0,
  y: 0,
  items: [] as MenuItem[],
  context: null as unknown,
});

function showMenu(e: MouseEvent, items: MenuItem[], context?: unknown) {
  e.preventDefault();
  menu.x = e.clientX;
  menu.y = e.clientY;
  menu.items = items;
  menu.context = context;
  menu.show = true;
}

function onMenuSelect(action: string) {
  vscode.postMessage({ type: "action", action, context: menu.context });
}

// Context menu definitions
function branchMenu(e: MouseEvent, b: RefEntry) {
  showMenu(
    e,
    [
      { label: "Checkout", action: "checkout" },
      { label: "Merge into Current", action: "merge" },
      { label: "Rebase Current onto This", action: "rebase" },
      { label: "Delete Branch", action: "deleteBranch" },
      { label: "Copy Branch Name", action: "copyName" },
    ],
    { kind: "branch", name: b.name },
  );
}

function remoteMenu(e: MouseEvent, name: string, url: string) {
  showMenu(
    e,
    [
      { label: "Fetch", action: "fetchRemote" },
      { label: "Delete", action: "deleteRemote" },
      { label: "Rename", action: "renameRemote" },
      { label: "Update URL", action: "updateRemoteUrl" },
      { label: "Copy URL", action: "copyRemoteUrl" },
    ],
    { kind: "remote", name, url },
  );
}

function remoteRefMenu(e: MouseEvent, remoteName: string, refName: string) {
  showMenu(
    e,
    [
      { label: "Checkout", action: "checkout" },
      { label: "Copy Name", action: "copyName" },
    ],
    { kind: "remoteRef", remote: remoteName, name: refName },
  );
}

function tagMenu(e: MouseEvent, t: RefEntry) {
  showMenu(
    e,
    [
      { label: "Checkout Tag", action: "checkout" },
      { label: "Delete Tag", action: "deleteTag" },
      { label: "Copy Tag Name", action: "copyName" },
    ],
    { kind: "tag", name: t.name },
  );
}

function stashMenu(e: MouseEvent, s: { label: string; index: number }) {
  showMenu(
    e,
    [
      { label: "Pop Stash", action: "popStash" },
      { label: "Apply Stash", action: "applyStash" },
      { label: "Drop Stash", action: "dropStash" },
    ],
    { kind: "stash", index: s.index, label: s.label },
  );
}

function submoduleMenu(e: MouseEvent, s: { name: string; path: string }) {
  showMenu(
    e,
    [
      { label: "Open Submodule", action: "openSubmodule" },
      { label: "Update Submodule", action: "updateSubmodule" },
      { label: "Copy Path", action: "copyPath" },
    ],
    { kind: "submodule", name: s.name, path: s.path },
  );
}

function onWindowMessage(e: MessageEvent) {
  const msg = e.data;
  if (msg.type === "locations") {
    repoPath.value = msg.repoPath;
    head.value = msg.head;
    branches.value = msg.branches;
    remotes.value = msg.remotes;
    tags.value = msg.tags;
    stashes.value = msg.stashes;
    submodules.value = msg.submodules;
  } else if (msg.type === "commits") {
    const isArray = Array.isArray(msg.commits);
    if (!isArray) {
      webviewLog("commits:payload-not-array", { payloadType: typeof msg.commits }, "warn");
    }
    const next = isArray ? msg.commits : [];
    commits.value = next;
    webviewLog("commits:received", {
      count: next.length,
      first: next[0]?.hash,
      last: next[next.length - 1]?.hash,
    });
  } else if (msg.type === "commitDetail") {
    commitDetail.value = msg.detail;
  } else if (msg.type === "pinnedRefs") {
    const p = msg.pinned;
    pinnedBranches.value = p.branches ?? [];
    pinnedRemotePins.value = p.remotes ?? {};
    pinnedTags.value = p.tags ?? [];
  } else if (msg.type === "resetHiddenRefs") {
    resetAllHiddenRefs();
  }
}

onMounted(() => {
  window.addEventListener("message", onWindowMessage);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("mergeCode:webviewLog", onComponentLog as EventListener);
  webviewLog("ready:posting");
  vscode.postMessage({ type: "ready" });
});

onUnmounted(() => {
  window.removeEventListener("message", onWindowMessage);
  window.removeEventListener("error", onWindowError);
  window.removeEventListener("unhandledrejection", onUnhandledRejection);
  window.removeEventListener("mergeCode:webviewLog", onComponentLog as EventListener);
});

watch(
  () => commits.value.length,
  (next, prev) => {
    if (next === 0 || prev === 0) {
      webviewLog("commits:length-transition", { prev, next });
    }
  },
);

const repoName = computed(() => {
  const parts = repoPath.value.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? "";
});
</script>

<template>
  <div class="root">
    <SplitPane :sizes="[250, 500, 350]" :min-size="120">
      <template #panel-0>
        <div class="locations-panel">
          <div class="panel-header">Locations</div>

          <LocationsTree
            label="BRANCHES"
            :count="branches.length"
            default-open
            show-eye
            :eye-off="allBranchesHidden"
            @toggle-eye="toggleAllBranches"
          >
            <RefTree
              :key="'branches-' + hiddenResetKey"
              :refs="branches"
              :base-depth="1"
              :head="head"
              :initial-pinned="pinnedBranches"
              @contextmenu="branchMenu"
              @hidden-change="onBranchHidden"
              @pinned-change="onBranchPinned"
              @click-ref="focusBranchCommit"
            />
          </LocationsTree>

          <LocationsTree
            label="REMOTES"
            :count="remotes.length"
            default-open
            show-eye
            :eye-off="allRemotesHidden"
            @toggle-eye="toggleAllRemotes"
          >
            <template v-for="r in remotes" :key="r.name">
              <LocationsTree
                :label="r.name"
                :count="r.refs.length"
                nested
                default-open
                show-eye
                :eye-off="isRemoteCategoryHidden(r.name)"
                @toggle-eye="toggleRemoteCategory(r.name)"
                @contextmenu.prevent="remoteMenu($event, r.name, r.url)"
              >
                <RefTree
                  :key="'remote-' + r.name + '-' + hiddenResetKey"
                  :refs="r.refs"
                  :base-depth="2"
                  :initial-pinned="pinnedRemotePins[r.name]"
                  @contextmenu="
                    (e: MouseEvent, entry: RefEntry) => remoteRefMenu(e, r.name, entry.name)
                  "
                  @hidden-change="(h: Set<string>) => onRemoteHidden(r.name, h)"
                  @pinned-change="(p: Set<string>) => onRemotePinned(r.name, p)"
                  @click-ref="focusBranchCommit"
                />
              </LocationsTree>
            </template>
          </LocationsTree>

          <LocationsTree
            label="TAGS"
            :count="tags.length"
            show-eye
            :eye-off="allTagsHidden"
            @toggle-eye="toggleAllTags"
          >
            <RefTree
              :key="'tags-' + hiddenResetKey"
              :refs="tags"
              :base-depth="1"
              :initial-pinned="pinnedTags"
              @contextmenu="tagMenu"
              @hidden-change="onTagHidden"
              @pinned-change="onTagPinned"
              @click-ref="focusBranchCommit"
            />
          </LocationsTree>

          <LocationsTree
            label="STASHES"
            :count="stashes.length"
            show-eye
            :eye-off="allStashesHidden"
            @toggle-eye="toggleAllStashes"
          >
            <div
              v-for="s in stashes"
              :key="s.index"
              class="tree-leaf"
              @contextmenu.prevent="stashMenu($event, s)"
            >
              {{ s.label }}
            </div>
          </LocationsTree>

          <LocationsTree label="SUBMODULES" :count="submodules.length">
            <div
              v-for="s in submodules"
              :key="s.name"
              class="tree-leaf"
              @contextmenu.prevent="submoduleMenu($event, s)"
            >
              {{ s.name }}
              <span class="description">{{ s.path }}</span>
            </div>
          </LocationsTree>
        </div>
      </template>

      <template #panel-1>
        <CommitList
          :commits="commits"
          :selected="selectedCommit"
          :focus-hash="focusHash"
          :head="head"
          @select="selectCommit($event)"
        />
      </template>

      <template #panel-2>
        <CommitDetail :detail="commitDetail" />
      </template>
    </SplitPane>

    <ContextMenu
      v-if="menu.show"
      :items="menu.items"
      :x="menu.x"
      :y="menu.y"
      @select="onMenuSelect"
      @close="menu.show = false"
    />
  </div>
</template>

<style scoped>
.root {
  font-family: var(--vscode-font-family, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  height: 100vh;
  overflow: hidden;
}
.locations-panel {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-top: 4px;
}
.panel-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-descriptionForeground);
  padding: 4px 12px 8px;
  text-align: center;
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
.description {
  color: var(--vscode-descriptionForeground);
  margin-left: auto;
}
</style>
