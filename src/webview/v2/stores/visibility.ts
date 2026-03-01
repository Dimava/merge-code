import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { post } from "./bridge";
import { useLocationsStore } from "./locations";
import type { HideConfig } from "../types";

export const useVisibilityStore = defineStore("visibility", () => {
  const hiddenBranches = ref(new Set<string>());
  const hiddenRemotes = ref(new Map<string, Set<string>>());
  const hiddenTags = ref(new Set<string>());

  const hideBranchesCategory = ref(false);
  const hideRemotesCategory = ref(false);
  const hideRemoteCategories = ref(new Map<string, boolean>());
  const hideTagsCategory = ref(false);
  const hideStashesCategory = ref(false);

  const customTargets = ref<string[]>([]);
  const resetKey = ref(0);

  // ── Computed: "all hidden" indicators ──

  const locations = useLocationsStore();

  const allBranchesHidden = computed(
    () =>
      hideBranchesCategory.value ||
      (locations.branches.length > 0 &&
        locations.branches.every((b) => hiddenBranches.value.has(b.name))),
  );

  const allRemotesHidden = computed(() => {
    if (hideRemotesCategory.value) return true;
    for (const r of locations.remotes) {
      if (hideRemoteCategories.value.get(r.name)) continue;
      const h = hiddenRemotes.value.get(r.name);
      if (!h || r.refs.some((ref) => !h.has(ref.name))) return false;
    }
    return locations.remotes.length > 0;
  });

  const allTagsHidden = computed(
    () =>
      hideTagsCategory.value ||
      (locations.tags.length > 0 && locations.tags.every((t) => hiddenTags.value.has(t.name))),
  );

  const allStashesHidden = computed(() => hideStashesCategory.value);

  function isRemoteCategoryHidden(name: string): boolean {
    return hideRemotesCategory.value || hideRemoteCategories.value.get(name) === true;
  }

  // ── Build & send ──

  function buildTargetPatterns(): string[] {
    const targets = new Set<string>();
    for (const [remote, hidden] of hiddenRemotes.value) {
      for (const name of hidden) targets.add(`remote:${remote}/${name}`);
    }
    for (const name of hiddenBranches.value) targets.add(`branch:${name}`);
    for (const name of hiddenTags.value) targets.add(`tag:${name}`);
    for (const pattern of customTargets.value) {
      const trimmed = pattern.trim();
      if (trimmed) targets.add(trimmed);
    }
    return [...targets];
  }

  function sendHideConfig() {
    const remoteCats: Record<string, boolean> = {};
    for (const [name, hidden] of hideRemoteCategories.value) remoteCats[name] = hidden;

    const hide: HideConfig = {
      categories: {
        branches: hideBranchesCategory.value,
        remotes: hideRemotesCategory.value,
        remoteCategories: remoteCats,
        tags: hideTagsCategory.value,
        stashes: hideStashesCategory.value,
      },
      targets: buildTargetPatterns(),
    };
    post({ type: "setHideConfig", hide });
  }

  // ── Per-item toggles (called by RefTree events) ──

  function sameSet(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  function onBranchHidden(hidden: Set<string>) {
    if (sameSet(hidden, hiddenBranches.value)) return;
    hiddenBranches.value = new Set(hidden);
    sendHideConfig();
  }

  function onRemoteHidden(remoteName: string, hidden: Set<string>) {
    const current = hiddenRemotes.value.get(remoteName);
    if (current && sameSet(hidden, current)) return;
    hiddenRemotes.value = new Map(hiddenRemotes.value).set(remoteName, new Set(hidden));
    sendHideConfig();
  }

  function onTagHidden(hidden: Set<string>) {
    if (sameSet(hidden, hiddenTags.value)) return;
    hiddenTags.value = new Set(hidden);
    sendHideConfig();
  }

  // ── Category toggles ──

  function toggleBranches() {
    hideBranchesCategory.value = !hideBranchesCategory.value;
    sendHideConfig();
  }

  function toggleRemotes() {
    hideRemotesCategory.value = !hideRemotesCategory.value;
    sendHideConfig();
  }

  function toggleTags() {
    hideTagsCategory.value = !hideTagsCategory.value;
    sendHideConfig();
  }

  function toggleStashes() {
    hideStashesCategory.value = !hideStashesCategory.value;
    sendHideConfig();
  }

  function toggleRemoteCategory(name: string) {
    const m = new Map(hideRemoteCategories.value);
    m.set(name, !(m.get(name) ?? false));
    hideRemoteCategories.value = m;
    sendHideConfig();
  }

  // ── Reset (triggered by host) ──

  function resetAll() {
    hiddenBranches.value = new Set();
    hiddenRemotes.value = new Map();
    hiddenTags.value = new Set();
    hideBranchesCategory.value = false;
    hideRemotesCategory.value = false;
    hideRemoteCategories.value = new Map();
    hideTagsCategory.value = false;
    hideStashesCategory.value = false;
    customTargets.value = [];
    resetKey.value += 1;
    sendHideConfig();
  }

  return {
    hiddenBranches,
    hiddenRemotes,
    hiddenTags,
    resetKey,
    allBranchesHidden,
    allRemotesHidden,
    allTagsHidden,
    allStashesHidden,
    isRemoteCategoryHidden,
    onBranchHidden,
    onRemoteHidden,
    onTagHidden,
    toggleBranches,
    toggleRemotes,
    toggleTags,
    toggleStashes,
    toggleRemoteCategory,
    resetAll,
  };
});
