import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./v3/App.vue";
import "./v3/styles.css";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
