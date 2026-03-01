import { ref } from "vue";
import { defineStore } from "pinia";
import { post } from "./bridge";
import type { PinnedRefs, PinnedRefsMessage } from "../types";

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const usePinnedStore = defineStore("pinned", () => {
  const branches = ref<string[]>([]);
  const remotes = ref<Record<string, string[]>>({});
  const tags = ref<string[]>([]);

  function handlePinnedRefs(msg: PinnedRefsMessage) {
    branches.value = msg.pinned.branches ?? [];
    remotes.value = msg.pinned.remotes ?? {};
    tags.value = msg.pinned.tags ?? [];
  }

  function send() {
    const pinned: PinnedRefs = {
      branches: [...branches.value],
      remotes: Object.fromEntries(Object.entries(remotes.value).map(([k, v]) => [k, [...v]])),
      tags: [...tags.value],
    };
    post({ type: "setPinnedRefs", pinned });
  }

  function onBranchPinned(pinned: Set<string>) {
    const next = [...pinned];
    if (sameArray(next, branches.value)) return;
    branches.value = next;
    send();
  }

  function onRemotePinned(remoteName: string, pinned: Set<string>) {
    const next = [...pinned];
    if (sameArray(next, remotes.value[remoteName] ?? [])) return;
    remotes.value = { ...remotes.value, [remoteName]: next };
    send();
  }

  function onTagPinned(pinned: Set<string>) {
    const next = [...pinned];
    if (sameArray(next, tags.value)) return;
    tags.value = next;
    send();
  }

  return {
    branches,
    remotes,
    tags,
    handlePinnedRefs,
    onBranchPinned,
    onRemotePinned,
    onTagPinned,
  };
});
