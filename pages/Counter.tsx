import { defineComponent, ref } from "vue";

export const Counter = defineComponent({
  setup() {
    const count = ref(0);

    return () => (
      <div class="flex flex-col items-center gap-4 p-8">
        <h2 class="text-2xl font-bold">TSX Counter</h2>
        <p class="text-lg">Count: {count.value}</p>
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
          onClick={() => count.value++}
        >
          Increment
        </button>
      </div>
    );
  },
});
