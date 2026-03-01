import { ref } from "vue";
import { defineStore } from "pinia";
import { post, webviewLog } from "./bridge";
import type { CommitEntry, CommitDetailData, CommitsMessage, CommitDetailMessage } from "../types";

export const useCommitsStore = defineStore("commits", () => {
  const list = ref<CommitEntry[]>([]);
  const selectedHash = ref<string>();
  const detail = ref<CommitDetailData>();
  const focusHash = ref<string>();

  function handleCommits(msg: CommitsMessage) {
    const isArray = Array.isArray(msg.commits);
    if (!isArray) {
      webviewLog("commits:payload-not-array", { payloadType: typeof msg.commits }, "warn");
    }
    list.value = isArray ? msg.commits : [];
    webviewLog("commits:received", {
      count: list.value.length,
      first: list.value[0]?.hash,
      last: list.value.at(-1)?.hash,
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
    if (!match) return;
    selectedHash.value = match.hash;
    focusHash.value = match.hash;
    detail.value = undefined;
    post({ type: "selectCommit", hash: match.hash });
  }

  return {
    list,
    selectedHash,
    detail,
    focusHash,
    handleCommits,
    handleCommitDetail,
    select,
    focusToCommit,
  };
});
