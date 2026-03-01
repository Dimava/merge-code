import { ref, computed } from "vue";
import { defineStore } from "pinia";
import type {
  BranchEntry,
  RemoteGroup,
  RefEntry,
  StashEntry,
  SubmoduleEntry,
  LocationsMessage,
} from "../types";

export const useLocationsStore = defineStore("locations", () => {
  const repoPath = ref("");
  const head = ref("");
  const branches = ref<BranchEntry[]>([]);
  const remotes = ref<RemoteGroup[]>([]);
  const tags = ref<RefEntry[]>([]);
  const stashes = ref<StashEntry[]>([]);
  const submodules = ref<SubmoduleEntry[]>([]);

  const repoName = computed(() => {
    const parts = repoPath.value.replace(/\\/g, "/").split("/");
    return parts.at(-1) ?? "";
  });

  function handleLocations(msg: LocationsMessage) {
    repoPath.value = msg.repoPath;
    head.value = msg.head;
    branches.value = msg.branches;
    remotes.value = msg.remotes;
    tags.value = msg.tags;
    stashes.value = msg.stashes;
    submodules.value = msg.submodules;
  }

  return {
    repoPath,
    head,
    branches,
    remotes,
    tags,
    stashes,
    submodules,
    repoName,
    handleLocations,
  };
});
