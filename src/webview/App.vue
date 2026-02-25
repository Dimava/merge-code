<script setup lang="ts">
import { ref, onMounted, computed, reactive } from "vue";
import LocationsTree from "./LocationsTree.vue";
import RefTree from "./RefTree.vue";
import ContextMenu from "./ContextMenu.vue";
import type { RefEntry } from "./RefTree.vue";
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
  showMenu(e, [
    { label: "Checkout", action: "checkout" },
    { label: "Merge into Current", action: "merge" },
    { label: "Rebase Current onto This", action: "rebase" },
    { label: "Delete Branch", action: "deleteBranch" },
    { label: "Copy Branch Name", action: "copyName" },
  ], { kind: "branch", name: b.name });
}

function remoteMenu(e: MouseEvent, name: string, url: string) {
  showMenu(e, [
    { label: `Fetch from ${name}`, action: "fetchRemote" },
    { label: `Delete ${name}`, action: "deleteRemote" },
    { label: `Rename ${name}`, action: "renameRemote" },
    { label: "Update Remote URL", action: "updateRemoteUrl" },
    { label: "Copy Remote URL", action: "copyRemoteUrl" },
  ], { kind: "remote", name, url });
}

function remoteRefMenu(e: MouseEvent, remoteName: string, refName: string) {
  showMenu(e, [
    { label: "Checkout", action: "checkout" },
    { label: "Copy Name", action: "copyName" },
  ], { kind: "remoteRef", remote: remoteName, name: refName });
}

function tagMenu(e: MouseEvent, t: RefEntry) {
  showMenu(e, [
    { label: "Checkout Tag", action: "checkout" },
    { label: "Delete Tag", action: "deleteTag" },
    { label: "Copy Tag Name", action: "copyName" },
  ], { kind: "tag", name: t.name });
}

function stashMenu(e: MouseEvent, s: { label: string; index: number }) {
  showMenu(e, [
    { label: "Pop Stash", action: "popStash" },
    { label: "Apply Stash", action: "applyStash" },
    { label: "Drop Stash", action: "dropStash" },
  ], { kind: "stash", index: s.index, label: s.label });
}

function submoduleMenu(e: MouseEvent, s: { name: string; path: string }) {
  showMenu(e, [
    { label: "Open Submodule", action: "openSubmodule" },
    { label: "Update Submodule", action: "updateSubmodule" },
    { label: "Copy Path", action: "copyPath" },
  ], { kind: "submodule", name: s.name, path: s.path });
}

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
        <RefTree :refs="branches" :base-depth="1" @contextmenu="branchMenu" />
      </LocationsTree>

      <LocationsTree label="REMOTES" :count="remotes.length" default-open>
        <template v-for="r in remotes" :key="r.name">
          <LocationsTree
            :label="r.name"
            :count="r.refs.length"
            :description="r.url"
            nested
            default-open
            @contextmenu.prevent="remoteMenu($event, r.name, r.url)"
          >
            <RefTree :refs="r.refs" :base-depth="2" @contextmenu="(e: MouseEvent, entry: RefEntry) => remoteRefMenu(e, r.name, entry.name)" />
          </LocationsTree>
        </template>
      </LocationsTree>

      <LocationsTree label="TAGS" :count="tags.length">
        <RefTree :refs="tags" :base-depth="1" @contextmenu="tagMenu" />
      </LocationsTree>

      <LocationsTree label="STASHES" :count="stashes.length">
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
.description {
  color: var(--vscode-descriptionForeground);
  margin-left: auto;
}
</style>
