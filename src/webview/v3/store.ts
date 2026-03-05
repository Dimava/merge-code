import { shallowRef, ref, watch } from "vue";
import { defineStore } from "pinia";
import { createWebSocketClient } from "./client";
import type { Router, RepoInfo, LocationsData, CommitEntry, CommitDetail, Filters } from "./plan";

const emptyLocations: LocationsData = {
  head: "",
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
  const repos = shallowRef<RepoInfo[]>([]);
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
    repos.value = await api.queries.getRepos();
    if (repos.value.length > 0 && !activeRepo.value) {
      activeRepo.value = repos.value[0]!.id;
      await refresh();
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

  return {
    repos,
    activeRepo,
    locations,
    commits,
    selectedHash,
    detail,
    filters,
    theme,
    connect,
    refresh,
    switchRepo,
    selectCommit,
    toggleTheme,
  };
});
