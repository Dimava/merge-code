<script setup lang="ts">
import { onMounted, onUnmounted, getCurrentInstance } from "vue";
import SplitPane from "../SplitPane.vue";
import LocationsTree from "../LocationsTree.vue";
import RefTree from "../RefTree.vue";
import CommitList from "../CommitList.vue";
import CommitDetail from "../CommitDetail.vue";
import ContextMenu from "../ContextMenu.vue";
import type { RefEntry } from "../RefTree.vue";

import { webviewLog } from "./stores/bridge";
import { useLocationsStore } from "./stores/locations";
import { useCommitsStore } from "./stores/commits";
import { useVisibilityStore } from "./stores/visibility";
import { usePinnedStore } from "./stores/pinned";
import { useUiStore } from "./stores/ui";
import { installMessageListener } from "./stores/listener";

const locations = useLocationsStore();
const commits = useCommitsStore();
const visibility = useVisibilityStore();
const pinned = usePinnedStore();
const ui = useUiStore();

// ── Global error handlers ──

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
  if (reason instanceof Error) reason = { message: reason.message, stack: reason.stack };
  webviewLog("window:unhandledrejection", { reason }, "error");
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
    webviewLog(
      "vue:errorHandler",
      {
        info,
        componentName,
        errString: String(err),
        message: err instanceof Error ? err.message : undefined,
        stack: err instanceof Error ? err.stack : undefined,
        err,
      },
      "error",
    );
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

// ── Lifecycle ──

let removeListener: (() => void) | undefined;

onMounted(() => {
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  removeListener = installMessageListener();
});

onUnmounted(() => {
  window.removeEventListener("error", onWindowError);
  window.removeEventListener("unhandledrejection", onUnhandledRejection);
  removeListener?.();
});

// ── Helpers for template (thin delegation) ──

function focusBranchCommit(entry: { name: string; commit?: string }) {
  if (entry.commit) commits.focusToCommit(entry.commit);
}

function remoteRefMenu(e: MouseEvent, entry: RefEntry, remoteName: string) {
  ui.remoteRefMenu(e, remoteName, entry.name);
}
</script>

<template>
  <div class="root">
    <SplitPane :sizes="[250, 500, 350]" :min-size="120">
      <template #panel-0>
        <div class="locations-panel">
          <div class="panel-header">Locations</div>

          <LocationsTree
            label="BRANCHES"
            :count="locations.branches.length"
            default-open
            show-eye
            :eye-off="visibility.allBranchesHidden"
            @toggle-eye="visibility.toggleBranches"
          >
            <RefTree
              :key="'branches-' + visibility.resetKey"
              :refs="locations.branches"
              :base-depth="1"
              :head="locations.head"
              :initial-pinned="pinned.branches"
              @contextmenu="ui.branchMenu"
              @hidden-change="visibility.onBranchHidden"
              @pinned-change="pinned.onBranchPinned"
              @click-ref="focusBranchCommit"
            />
          </LocationsTree>

          <LocationsTree
            label="REMOTES"
            :count="locations.remotes.length"
            default-open
            show-eye
            :eye-off="visibility.allRemotesHidden"
            @toggle-eye="visibility.toggleRemotes"
          >
            <template v-for="r in locations.remotes" :key="r.name">
              <LocationsTree
                :label="r.name"
                :count="r.refs.length"
                nested
                default-open
                show-eye
                :eye-off="visibility.isRemoteCategoryHidden(r.name)"
                @toggle-eye="visibility.toggleRemoteCategory(r.name)"
                @contextmenu.prevent="ui.remoteMenu($event, r.name, r.url)"
              >
                <RefTree
                  :key="'remote-' + r.name + '-' + visibility.resetKey"
                  :refs="r.refs"
                  :base-depth="2"
                  :initial-pinned="pinned.remotes[r.name]"
                  @contextmenu="(e: MouseEvent, entry: RefEntry) => remoteRefMenu(e, entry, r.name)"
                  @hidden-change="(h: Set<string>) => visibility.onRemoteHidden(r.name, h)"
                  @pinned-change="(p: Set<string>) => pinned.onRemotePinned(r.name, p)"
                  @click-ref="focusBranchCommit"
                />
              </LocationsTree>
            </template>
          </LocationsTree>

          <LocationsTree
            label="TAGS"
            :count="locations.tags.length"
            show-eye
            :eye-off="visibility.allTagsHidden"
            @toggle-eye="visibility.toggleTags"
          >
            <RefTree
              :key="'tags-' + visibility.resetKey"
              :refs="locations.tags"
              :base-depth="1"
              :initial-pinned="pinned.tags"
              @contextmenu="ui.tagMenu"
              @hidden-change="visibility.onTagHidden"
              @pinned-change="pinned.onTagPinned"
              @click-ref="focusBranchCommit"
            />
          </LocationsTree>

          <LocationsTree
            label="STASHES"
            :count="locations.stashes.length"
            show-eye
            :eye-off="visibility.allStashesHidden"
            @toggle-eye="visibility.toggleStashes"
          >
            <div
              v-for="s in locations.stashes"
              :key="s.index"
              class="tree-leaf"
              @contextmenu.prevent="ui.stashMenu($event, s)"
            >
              {{ s.label }}
            </div>
          </LocationsTree>

          <LocationsTree label="SUBMODULES" :count="locations.submodules.length">
            <div
              v-for="s in locations.submodules"
              :key="s.name"
              class="tree-leaf"
              @contextmenu.prevent="ui.submoduleMenu($event, s)"
            >
              {{ s.name }}
              <span class="description">{{ s.path }}</span>
            </div>
          </LocationsTree>
        </div>
      </template>

      <template #panel-1>
        <CommitList
          :commits="commits.list"
          :selected="commits.selectedHash"
          :focus-hash="commits.focusHash"
          :head="locations.head"
          @select="commits.select($event)"
        />
      </template>

      <template #panel-2>
        <CommitDetail :detail="commits.detail" />
      </template>
    </SplitPane>

    <ContextMenu
      v-if="ui.menu.show"
      :items="ui.menu.items"
      :x="ui.menu.x"
      :y="ui.menu.y"
      @select="ui.onMenuSelect"
      @close="ui.closeMenu"
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
