import { createWebSocketClient } from "./client";

const wsUrl = `ws://${location.host}/ws`;
const api = createWebSocketClient(wsUrl);

async function init() {
  const app = document.getElementById("app")!;

  try {
    const [repos, locations, commits] = await Promise.all([
      api.queries.getRepos(),
      api.queries.getLocations(),
      api.queries.getCommits({ filters: { hiddenCategories: new Set(), hiddenRefs: new Set(), pinnedRefs: new Set(), expandedMerges: new Set() } }),
    ]);

    app.innerHTML = `
      <pre style="padding: 1em; overflow: auto; width: 100%;">${JSON.stringify({ repos, locations, commits: commits.slice(0, 20) }, null, 2)}</pre>
    `;

    api.subscriptions.onRepoChanged(() => {
      console.log("repo changed");
    });
  } catch (err) {
    app.innerHTML = `<div class="loading" style="color: #f44;">${err}</div>`;
  }
}

init();
