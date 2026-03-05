<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

export interface MenuItem {
  label: string;
  action: string;
}

const props = defineProps<{
  items: MenuItem[];
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  select: [action: string];
  close: [];
}>();

const el = ref<HTMLElement>();

function onClickOutside(e: MouseEvent) {
  if (el.value && !el.value.contains(e.target as Node)) {
    emit("close");
  }
}

onMounted(() => {
  setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onClickOutside);
});
</script>

<template>
  <div ref="el" class="context-menu" :style="{ left: x + 'px', top: y + 'px' }">
    <div
      v-for="item in items"
      :key="item.action"
      class="menu-item"
      @click="
        emit('select', item.action);
        emit('close');
      "
    >
      {{ item.label }}
    </div>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--vscode-menu-background, #252526);
  border: 1px solid var(--vscode-menu-border, #454545);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.menu-item {
  padding: 4px 20px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  color: var(--vscode-menu-foreground, #ccc);
}
.menu-item:hover {
  background: var(--vscode-menu-selectionBackground, #094771);
  color: var(--vscode-menu-selectionForeground, #fff);
}
</style>
