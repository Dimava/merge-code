<script setup lang="ts">
import { onMounted } from "vue";
import RepoTabs from "./RepoTabs.vue";
import SplitGrid from "./SplitGrid.vue";
import Locations from "./Locations.vue";
import CommitList from "./CommitList.vue";
import CommitDetail from "./CommitDetail.vue";
import { useAppStore } from "./store";

const store = useAppStore();
onMounted(store.connect);
</script>

<template>
  <div class="root">
    <RepoTabs />
    <SplitGrid>
      <template #pane1>
        <Locations />
      </template>
      <template #pane2>
        <CommitList />
      </template>
      <template #pane3>
        <CommitDetail />
      </template>
    </SplitGrid>
  </div>
</template>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
