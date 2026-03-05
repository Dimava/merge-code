import { shallowRef, ref } from "vue";
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

// ── Reactive state ──

export const repos = shallowRef<RepoInfo[]>([]);
export const activeRepo = ref<string | null>(null);
export const locations = shallowRef<LocationsData>(emptyLocations);
export const commits = shallowRef<CommitEntry[]>([]);
export const selectedHash = ref<string | null>(null);
export const detail = shallowRef<CommitDetail | null>(null);
export const filters = ref<Filters>(emptyFilters);

// ── API ──

let api: Router | null = null;

export function connect() {
  const wsUrl = `ws://${location.host}/ws`;
  const client = createWebSocketClient(wsUrl);
  api = client;

  client.subscriptions.onRepoChanged(refresh);

  // Initial load
  loadRepos();
}

async function loadRepos() {
  if (!api) return;
  repos.value = await api.queries.getRepos();
  if (repos.value.length > 0 && !activeRepo.value) {
    activeRepo.value = repos.value[0]!.id;
    await refresh();
  }
}

export async function refresh() {
  if (!api || !activeRepo.value) return;
  const repo = activeRepo.value;
  const [loc, coms] = await Promise.all([
    api.queries.getLocations({ repo }),
    api.queries.getCommits({ repo, filters: filters.value }),
  ]);
  locations.value = loc;
  commits.value = coms;
}

export async function switchRepo(repoId: string) {
  if (!api) return;
  activeRepo.value = repoId;
  selectedHash.value = null;
  detail.value = null;
  await refresh();
}

export async function selectCommit(hash: string) {
  if (!api || !activeRepo.value) return;
  selectedHash.value = hash;
  detail.value = null;
  detail.value = await api.queries.getCommitDetail({ repo: activeRepo.value, hash });
}
