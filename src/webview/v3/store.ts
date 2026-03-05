import { shallowRef, ref, computed, watch } from "vue";
import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { createWebSocketClient } from "./client";
import type { Router, RepoInfo, LocationsData, CommitEntry, CommitDetail, Filters } from "./plan";

const emptyLocations: LocationsData = {
  head: "",
  headHash: "",
  branches: [],
  remotes: [],
  tags: [],
  stashes: [],
};

const emptyFilters: Filters = {
  hiddenCategories: new Set(),
  hiddenRefs: new Set(),
  pinnedRefs: new Set(),
  expandedMerges: new Set(),
};

function getInitialTheme(): "dark" | "light" {
  const stored = localStorage.getItem("mc-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export const useAppStore = defineStore("app", () => {
  const focusRequest = shallowRef<{ key: string } | null>(null);
  function focusLocation(refKey: string) {
    focusRequest.value = { key: refKey };
  }

  const defaultRepoInfo = shallowRef<RepoInfo | null>(null);
  const extraRepos = useLocalStorage<RepoInfo[]>("mc-extra-repos", []);
  const repos = computed<RepoInfo[]>(() => {
    if (!defaultRepoInfo.value) return extraRepos.value;
    return [
      defaultRepoInfo.value,
      ...extraRepos.value.filter((r) => r.id !== defaultRepoInfo.value!.id),
    ];
  });
  const activeRepo = ref<string | null>(null);
  const locations = shallowRef<LocationsData>(emptyLocations);
  const commits = shallowRef<CommitEntry[]>([]);
  const selectedHash = ref<string | null>(null);
  const detail = shallowRef<CommitDetail | null>(null);
  const filters = ref<Filters>(emptyFilters);
  const theme = ref<"dark" | "light">(getInitialTheme());

  watch(
    theme,
    (t) => {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("mc-theme", t);
    },
    { immediate: true },
  );

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  let api: Router | null = null;

  function connect() {
    const wsUrl = `ws://${location.host}/ws`;
    const client = createWebSocketClient(wsUrl);
    api = client;

    client.subscriptions.onRepoChanged(refresh);

    void loadRepos();
  }

  async function loadRepos() {
    if (!api) return;
    const [defaultRepo] = await api.queries.getRepos();
    if (defaultRepo) defaultRepoInfo.value = defaultRepo;
    if (!activeRepo.value && repos.value.length > 0) {
      activeRepo.value = repos.value[0]!.id;
      await refresh();
    }
  }

  async function addRepo() {
    if (!api) return;
    const input = prompt("Enter repo path:");
    if (!input) return;
    const info = await api.queries.checkRepo({ path: input });
    if (!info) {
      alert(`Not a valid git repo: ${input}`);
      return;
    }
    if (repos.value.some((r) => r.id === info.id)) return;
    extraRepos.value = [...extraRepos.value, info];
  }

  function removeRepo(id: string) {
    if (id === defaultRepoInfo.value?.id) return;
    extraRepos.value = extraRepos.value.filter((r) => r.id !== id);
    if (activeRepo.value === id) {
      activeRepo.value = repos.value[0]?.id ?? null;
      void refresh();
    }
  }

  async function refresh() {
    if (!api || !activeRepo.value) return;
    const repo = activeRepo.value;
    const [loc, coms] = await Promise.all([
      api.queries.getLocations({ repo }),
      api.queries.getCommits({ repo, filters: filters.value }),
    ]);
    locations.value = loc;
    commits.value = coms;
  }

  async function switchRepo(repoId: string) {
    if (!api) return;
    activeRepo.value = repoId;
    selectedHash.value = null;
    detail.value = null;
    await refresh();
  }

  async function selectCommit(hash: string) {
    if (!api || !activeRepo.value) return;
    selectedHash.value = hash;
    detail.value = null;
    detail.value = await api.queries.getCommitDetail({ repo: activeRepo.value, hash });
  }

  function togglePin(refKey: string) {
    const next = new Set(filters.value.pinnedRefs);
    if (next.has(refKey)) next.delete(refKey);
    else next.add(refKey);
    filters.value = { ...filters.value, pinnedRefs: next };
  }

  function isPinned(refKey: string) {
    return filters.value.pinnedRefs.has(refKey);
  }

  const timeSorted = ref(new Set<string>());

  function isTimeSorted(key: string) {
    return timeSorted.value.has(key);
  }

  function toggleTimeSort(key: string) {
    const next = new Set(timeSorted.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    timeSorted.value = next;
  }

  function toggleHide(refKey: string) {
    const next = new Set(filters.value.hiddenRefs);
    if (next.has(refKey)) next.delete(refKey);
    else next.add(refKey);
    filters.value = { ...filters.value, hiddenRefs: next };
  }

  function isHidden(refKey: string) {
    return filters.value.hiddenRefs.has(refKey);
  }

  const selectedCommit = computed(() =>
    selectedHash.value ? commits.value.find((c) => c.hash === selectedHash.value) ?? null : null,
  );

  function isRefSelected(refKey: string) {
    const c = selectedCommit.value;
    if (!c) return false;
    const [type, name] = refKey.split(":") as [string, string];
    return c.deco.some((d) => d.type === type && d.name === name);
  }

  function isStashSelected(index: number) {
    const c = selectedCommit.value;
    if (!c?.isStash) return false;
    const s = locations.value.stashes.find((st) => st.index === index);
    return s ? s.hash === c.hash : false;
  }

  return {
    repos,
    activeRepo,
    defaultRepoInfo,
    locations,
    commits,
    selectedHash,
    detail,
    filters,
    theme,
    connect,
    refresh,
    switchRepo,
    addRepo,
    removeRepo,
    selectCommit,
    toggleTheme,
    togglePin,
    isPinned,
    toggleHide,
    isHidden,
    focusRequest,
    focusLocation,
    isRefSelected,
    isStashSelected,
    timeSorted,
    isTimeSorted,
    toggleTimeSort,
  };
});
