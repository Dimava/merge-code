import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { post, webviewLog } from "./bridge";
import { computeGraphRows, computeGraphWidth } from "../graph-layout";
import type { CommitEntry, CommitDetailData, CommitsMessage, CommitDetailMessage } from "../types";
import type { GraphRow } from "../graph-layout";

const COL_W = 12;

export const useCommitsStore = defineStore("commits", () => {
  const list = ref<CommitEntry[]>([]);
  const selectedHash = ref<string>();
  const detail = ref<CommitDetailData>();
  const focusHash = ref<string>();

  const graphRows = computed<GraphRow[]>(() => computeGraphRows(list.value));
  const graphWidth = computed(() => computeGraphWidth(graphRows.value, COL_W));

  function handleCommits(msg: CommitsMessage) {
    const isArray = Array.isArray(msg.commits);
    if (!isArray) {
      webviewLog("commits:payload-not-array", { payloadType: typeof msg.commits }, "warn");
    }
    list.value = isArray ? msg.commits : [];
    const targetFocus = msg.focusHash;
    if (targetFocus) {
      const focus = list.value.find((c) => c.hash.startsWith(targetFocus));
      if (focus) {
        selectedHash.value = focus.hash;
        focusHash.value = undefined;
        focusHash.value = focus.hash;
        detail.value = undefined;
        post({ type: "selectCommit", hash: focus.hash });
      }
      return;
    }

    const current = selectedHash.value;
    const currentStillVisible = current ? list.value.some((c) => c.hash === current) : false;
    if (currentStillVisible) return;

    const preferred =
      list.value.find((c) => c.isUncommitted || c.hash === "__uncommitted__") ?? list.value[0];
    if (preferred) {
      selectedHash.value = preferred.hash;
      focusHash.value = undefined;
      detail.value = undefined;
      post({ type: "selectCommit", hash: preferred.hash });
    }
    webviewLog("commits:received", {
      count: list.value.length,
      first: list.value[0]?.hash,
      last: list.value.at(-1)?.hash,
      focus: msg.focusHash,
    });
  }

  function handleCommitDetail(msg: CommitDetailMessage) {
    detail.value = msg.detail;
  }

  function select(hash: string) {
    selectedHash.value = hash;
    detail.value = undefined;
    post({ type: "selectCommit", hash });
  }

  function focusToCommit(shortHash: string) {
    const match = list.value.find((c) => c.hash.startsWith(shortHash));
    if (match) {
      selectedHash.value = match.hash;
      focusHash.value = undefined;
      focusHash.value = match.hash;
      detail.value = undefined;
      post({ type: "selectCommit", hash: match.hash });
      return;
    }
    // Not in current window: ask host to reload around this commit.
    post({ type: "focusCommit", hash: shortHash });
  }

  return {
    list,
    selectedHash,
    detail,
    focusHash,
    graphRows,
    graphWidth,
    handleCommits,
    handleCommitDetail,
    select,
    focusToCommit,
  };
});
