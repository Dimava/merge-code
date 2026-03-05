<script setup lang="ts">
import { computed } from "vue";
import TreeSection from "./TreeSection.vue";

const props = withDefaults(
  defineProps<{
    items: { name: string; [k: string]: any }[];
    depth?: number;
    refKeyPrefix?: string;
  }>(),
  { depth: 0, refKeyPrefix: "" },
);

interface FolderEntry {
  prefix: string;
  children: { name: string; [k: string]: any }[];
}

const tree = computed(() => {
  const folders = new Map<string, any[]>();
  const leaves: any[] = [];

  for (const item of props.items) {
    const idx = item.name.indexOf("/");
    if (idx === -1) {
      leaves.push(item);
    } else {
      const prefix = item.name.slice(0, idx);
      const child = { ...item, name: item.name.slice(idx + 1) };
      if (!folders.has(prefix)) folders.set(prefix, []);
      folders.get(prefix)!.push(child);
    }
  }

  const folderList: FolderEntry[] = [...folders.entries()].map(([prefix, children]) => ({
    prefix,
    children,
  }));
  return { folders: folderList, leaves };
});
</script>

<template>
  <template v-for="f in tree.folders" :key="'f-' + f.prefix">
    <TreeSection
      :label="f.prefix"
      :count="f.children.length"
      :ref-key="refKeyPrefix + 'folder:' + f.prefix"
      nested
      :depth="depth"
      default-open
    >
      <BranchFolder
        :items="f.children"
        :depth="depth + 1"
        :ref-key-prefix="refKeyPrefix + f.prefix + '/'"
      >
        <template #default="{ item, depth: d }">
          <slot :item="item" :depth="d" />
        </template>
      </BranchFolder>
    </TreeSection>
  </template>
  <template v-for="item in tree.leaves" :key="'l-' + item.name">
    <slot :item="item" :depth="depth" />
  </template>
</template>
