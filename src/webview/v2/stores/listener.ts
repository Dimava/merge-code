import { watch } from "vue";
import { post, webviewLog } from "./bridge";
import { useLocationsStore } from "./locations";
import { useCommitsStore } from "./commits";
import { useVisibilityStore } from "./visibility";
import { usePinnedStore } from "./pinned";
import type { HostMessage } from "../types";

export function installMessageListener() {
  const locations = useLocationsStore();
  const commits = useCommitsStore();
  const visibility = useVisibilityStore();
  const pinned = usePinnedStore();

  function onMessage(e: MessageEvent) {
    const msg = e.data as HostMessage;
    switch (msg.type) {
      case "locations":
        locations.handleLocations(msg);
        break;
      case "commits":
        commits.handleCommits(msg);
        break;
      case "commitDetail":
        commits.handleCommitDetail(msg);
        break;
      case "pinnedRefs":
        pinned.handlePinnedRefs(msg);
        break;
      case "resetHiddenRefs":
        visibility.resetAll();
        break;
    }
  }

  window.addEventListener("message", onMessage);

  watch(
    () => commits.list.length,
    (next, prev) => {
      if (next === 0 || prev === 0) {
        webviewLog("commits:length-transition", { prev, next });
      }
    },
  );

  webviewLog("ready:posting");
  post({ type: "ready" });

  return () => window.removeEventListener("message", onMessage);
}
