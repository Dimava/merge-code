<script setup lang="ts">
import { ref, onMounted } from "vue";

const repoPath = ref("");
const branch = ref("");

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

onMounted(() => {
  window.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "repoInfo") {
      repoPath.value = msg.repoPath;
      branch.value = msg.branch;
    }
  });
  vscode.postMessage({ type: "ready" });
});
</script>

<template>
  <div class="root">
    <h1>Merge Code</h1>
    <div v-if="repoPath" class="info">
      <p class="repo">{{ repoPath }}</p>
      <p class="branch">{{ branch }}</p>
    </div>
    <p v-else class="loading">Waiting for repository info...</p>
  </div>
</template>

<style scoped>
.root {
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  padding: 16px;
  min-height: 100vh;
}
h1 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 12px;
}
.info {
  font-size: 13px;
}
.repo {
  color: var(--vscode-descriptionForeground);
  margin: 0 0 4px;
}
.branch {
  color: var(--vscode-textLink-foreground);
  font-weight: 600;
  margin: 0;
}
.loading {
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}
</style>
