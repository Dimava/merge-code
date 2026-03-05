<script setup lang="ts">
import { onMounted } from "vue";
import RepoTabs from "./RepoTabs.vue";
import SplitGrid from "./SplitGrid.vue";
import Locations from "./Locations.vue";
import { connect } from "./store";

onMounted(connect);
</script>

<template>
  <div class="root">
    <RepoTabs />
    <SplitGrid>
      <template #pane1>
        <Locations />
      </template>
      <template #pane2>
        <div class="pane">
          <h2>Commits</h2>
        </div>
      </template>
      <template #pane3>
        <div class="pane">
          <h2>Detail</h2>
        </div>
      </template>
    </SplitGrid>
  </div>
</template>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.pane {
  padding: 12px;
  height: 100%;
}

h2 {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #888;
}
</style>
