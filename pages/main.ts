import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);

// HMR support for Bun dev server
if (import.meta.hot) {
  import.meta.hot.on("bun:invalidate", () => {
    app.unmount();
  });
  import.meta.hot.accept();
}

app.mount("#app");
