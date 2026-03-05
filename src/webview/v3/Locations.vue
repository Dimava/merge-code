<script setup lang="ts">
import { computed } from "vue";
import { useAppStore } from "./store";
import TreeSection from "./TreeSection.vue";
import BranchFolder from "./BranchFolder.vue";
import RefItem from "./RefItem.vue";

const store = useAppStore();

const branchItems = computed(() =>
  store.locations.branches.map((b) => ({ ...b, _refKey: "branch:" + b.name })),
);

const pinnedBranches = computed(() => branchItems.value.filter((b) => store.isPinned(b._refKey)));

const branchesByTime = computed(() =>
  [...branchItems.value].sort((a, b) => (a.date < b.date ? 1 : -1)),
);

function normalizeBranch(b: string | { name: string; date: string }) {
  return typeof b === "string" ? { name: b, date: "" } : b;
}

function remoteItems(remoteName: string, branches: (string | { name: string; date: string })[]) {
  return branches.map((b) => {
    const n = normalizeBranch(b);
    return { ...n, _refKey: "remote:" + remoteName + "/" + n.name };
  });
}

function remoteItemsByTime(
  remoteName: string,
  branches: (string | { name: string; date: string })[],
) {
  return [...remoteItems(remoteName, branches)].sort((a, b) => (a.date < b.date ? 1 : -1));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function displayDate(iso: string, rel: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const age = Date.now() - d.getTime();
  if (age < 4 * WEEK_MS) return rel;
  const mon = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  const yr = d.getFullYear();
  return yr === new Date().getFullYear() ? `${mon} ${day}` : `${mon} ${day}, ${yr}`;
}
</script>

<template>
  <div class="locations">
    <RefItem
      v-if="store.locations.head"
      :ref-key="'branch:' + store.locations.head"
      :name="store.locations.head"
      class="head-row"
    >
      <template #before><span class="head-dot">●</span></template>
    </RefItem>

    <TreeSection
      label="Branches"
      :count="store.locations.branches.length"
      sort-key="branches"
      default-open
    >
      <template #pinned>
        <RefItem
          v-for="b in pinnedBranches"
          :key="'pin-' + b._refKey"
          :ref-key="b._refKey"
          :name="b.name"
        />
      </template>
      <template v-if="store.isTimeSorted('branches')">
        <RefItem v-for="b in branchesByTime" :key="b._refKey" :ref-key="b._refKey" :name="b.name">
          <span v-if="b.ahead || b.behind" class="badge">
            <span v-if="b.ahead" class="ahead">{{ b.ahead }}&#8593;</span>
            <span v-if="b.behind" class="behind">{{ b.behind }}&#8595;</span>
          </span>
          <span class="date">{{ displayDate(b.date, b.dateRel) }}</span>
        </RefItem>
      </template>
      <BranchFolder v-else :items="branchItems">
        <template #default="{ item: b, depth }">
          <RefItem :ref-key="b._refKey" :name="b.name" :depth="depth">
            <span v-if="b.ahead || b.behind" class="badge">
              <span v-if="b.ahead" class="ahead">{{ b.ahead }}&#8593;</span>
              <span v-if="b.behind" class="behind">{{ b.behind }}&#8595;</span>
            </span>
          </RefItem>
        </template>
      </BranchFolder>
    </TreeSection>

    <TreeSection
      label="Remotes"
      :count="store.locations.remotes.length"
      sort-key="remotes"
      default-open
    >
      <TreeSection
        v-for="r in store.locations.remotes"
        :key="r.name"
        :label="r.name"
        :count="r.branches.length"
        :ref-key="'remote-group:' + r.name"
        nested
        default-open
      >
        <template v-if="store.isTimeSorted('remotes')">
          <RefItem
            v-for="item in remoteItemsByTime(r.name, r.branches)"
            :key="item._refKey"
            :ref-key="item._refKey"
            :name="item.name"
          >
            <span class="date">{{ displayDate(item.date, item.dateRel) }}</span>
          </RefItem>
        </template>
        <BranchFolder v-else :items="remoteItems(r.name, r.branches)" :depth="1">
          <template #default="{ item, depth }">
            <RefItem :ref-key="item._refKey" :name="item.name" :depth="depth" />
          </template>
        </BranchFolder>
      </TreeSection>
    </TreeSection>

    <TreeSection label="Tags" :count="store.locations.tags.length" sort-key="tags">
      <div v-for="t in store.locations.tags" :key="t.name" class="tree-item">
        <span class="item-name">{{ t.name }}</span>
        <span v-if="t.date" class="date">{{ displayDate(t.date, t.dateRel) }}</span>
      </div>
    </TreeSection>

    <TreeSection label="Stashes" :count="store.locations.stashes.length">
      <div v-for="s in store.locations.stashes" :key="s.index" class="tree-item">
        <span class="item-name">{{ s.label }}</span>
      </div>
    </TreeSection>
  </div>
</template>

<style scoped>
.locations {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-top: 4px;
  scrollbar-gutter: stable;
}

.head-row {
  font-weight: 600;
  margin-bottom: 4px;
}

.head-dot {
  color: #3fb950;
  font-size: 8px;
  margin-right: 4px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0 2px 30px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  transition: background 0.1s;
}

.tree-item:hover {
  background: var(--bg-hover);
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge {
  display: flex;
  font-size: 10px;
  flex-shrink: 0;
}

.ahead,
.behind {
  padding: 0 3px;
  line-height: 1.5;
}

.ahead {
  background: var(--diff-add-bg);
  color: var(--diff-add-fg);
  border-radius: 3px;
}

.behind {
  background: var(--diff-del-bg);
  color: var(--diff-del-fg);
  border-radius: 3px;
}

.ahead:has(+ .behind) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.ahead + .behind {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.date {
  color: var(--fg-faint);
  font-size: 11px;
  margin-left: auto;
}
</style>
