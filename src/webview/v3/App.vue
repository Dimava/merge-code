<script setup lang="ts">
import { ref } from "vue";
import SplitGrid from "./SplitGrid.vue";
</script>

<template>
  <SplitGrid>
    <template #pane1>
      <div class="pane">
        <h2>Locations</h2>
      </div>
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
</template>

<style scoped>
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
