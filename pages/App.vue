<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <div class="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-8" un-cloak>
    <h1 class="text-4xl font-bold mb-4 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
      Vue + UnoCSS
    </h1>

    <p class="text-lg text-gray-400 mb-8 max-w-md text-center">
      This page uses Vue 3 with Bun and UnoCSS runtime for on-the-fly style generation.
    </p>

    <div class="grid grid-cols-3 gap-4 mb-8">
      <div class="w-20 h-20 rounded-lg bg-red-500 flex items-center justify-center hover:scale-110 transition-transform cursor-pointer" @click="count++">
        <span class="text-2xl">🔴</span>
      </div>
      <div class="w-20 h-20 rounded-lg bg-green-500 flex items-center justify-center hover:scale-110 transition-transform cursor-pointer" @click="count++">
        <span class="text-2xl">🟢</span>
      </div>
      <div class="w-20 h-20 rounded-lg bg-blue-500 flex items-center justify-center hover:scale-110 transition-transform cursor-pointer" @click="count++">
        <span class="text-2xl">🔵</span>
      </div>
    </div>

    <button class="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all cursor-pointer mb-4" @click="count++">
      Clicked {{ count }} times
    </button>

    <div class="mt-8 text-sm text-gray-500">
      <code class="bg-gray-800 px-2 py-1 rounded">Vue 3 + UnoCSS Runtime</code>
    </div>
  </div>
</template>
