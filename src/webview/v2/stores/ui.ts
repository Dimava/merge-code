import { reactive } from "vue";
import { defineStore } from "pinia";
import { post } from "./bridge";
import type { MenuItem, BranchEntry, RefEntry, StashEntry, SubmoduleEntry } from "../types";

export const useUiStore = defineStore("ui", () => {
  const menu = reactive({
    show: false,
    x: 0,
    y: 0,
    items: [] as MenuItem[],
    context: null as unknown,
  });

  function showMenu(e: MouseEvent, items: MenuItem[], context?: unknown) {
    e.preventDefault();
    menu.x = e.clientX;
    menu.y = e.clientY;
    menu.items = items;
    menu.context = context;
    menu.show = true;
  }

  function closeMenu() {
    menu.show = false;
  }

  function onMenuSelect(action: string) {
    post({ type: "action", action, context: menu.context });
  }

  // ── Menu builders ──

  function branchMenu(e: MouseEvent, b: BranchEntry | RefEntry) {
    showMenu(
      e,
      [
        { label: "Checkout", action: "checkout" },
        { label: "Merge into Current", action: "merge" },
        { label: "Rebase Current onto This", action: "rebase" },
        { label: "Delete Branch", action: "deleteBranch" },
        { label: "Copy Branch Name", action: "copyName" },
      ],
      { kind: "branch", name: b.name },
    );
  }

  function remoteMenu(e: MouseEvent, name: string, url: string) {
    showMenu(
      e,
      [
        { label: "Fetch", action: "fetchRemote" },
        { label: "Delete", action: "deleteRemote" },
        { label: "Rename", action: "renameRemote" },
        { label: "Update URL", action: "updateRemoteUrl" },
        { label: "Copy URL", action: "copyRemoteUrl" },
      ],
      { kind: "remote", name, url },
    );
  }

  function remoteRefMenu(e: MouseEvent, remoteName: string, refName: string) {
    showMenu(
      e,
      [
        { label: "Checkout", action: "checkout" },
        { label: "Copy Name", action: "copyName" },
      ],
      { kind: "remoteRef", remote: remoteName, name: refName },
    );
  }

  function tagMenu(e: MouseEvent, t: RefEntry) {
    showMenu(
      e,
      [
        { label: "Checkout Tag", action: "checkout" },
        { label: "Delete Tag", action: "deleteTag" },
        { label: "Copy Tag Name", action: "copyName" },
      ],
      { kind: "tag", name: t.name },
    );
  }

  function stashMenu(e: MouseEvent, s: StashEntry) {
    showMenu(
      e,
      [
        { label: "Pop Stash", action: "popStash" },
        { label: "Apply Stash", action: "applyStash" },
        { label: "Drop Stash", action: "dropStash" },
      ],
      { kind: "stash", index: s.index, label: s.label },
    );
  }

  function submoduleMenu(e: MouseEvent, s: SubmoduleEntry) {
    showMenu(
      e,
      [
        { label: "Open Submodule", action: "openSubmodule" },
        { label: "Update Submodule", action: "updateSubmodule" },
        { label: "Copy Path", action: "copyPath" },
      ],
      { kind: "submodule", name: s.name, path: s.path },
    );
  }

  return {
    menu,
    showMenu,
    closeMenu,
    onMenuSelect,
    branchMenu,
    remoteMenu,
    remoteRefMenu,
    tagMenu,
    stashMenu,
    submoduleMenu,
  };
});
