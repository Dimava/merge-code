import type {
  RouterQueries,
  RouterMutations,
  RouterSubscriptions,
  Router,
} from "./plan";

type RpcRequest = { id: number; method: string; params?: unknown };
type RpcResponse = { id: number; result?: unknown; error?: string };
type SubscriptionMessage = { type: "subscription"; event: string };

export function createWebSocketClient(url: string): Router & { close(): void } {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const subscriptionHandlers: Record<string, Set<() => void>> = {};

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(String(e.data));

    if (msg.type === "subscription") {
      const sub = msg as SubscriptionMessage;
      const handlers = subscriptionHandlers[sub.event];
      if (handlers) handlers.forEach((cb) => cb());
      return;
    }

    const resp = msg as RpcResponse;
    const p = pending.get(resp.id);
    if (!p) return;
    pending.delete(resp.id);
    if (resp.error) {
      p.reject(new Error(resp.error));
    } else {
      p.resolve(resp.result);
    }
  });

  function call(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const msg: RpcRequest = { id, method, ...(params !== undefined && { params }) };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        ws.addEventListener("open", () => ws.send(JSON.stringify(msg)), { once: true });
      }
    });
  }

  function subscribe(event: string, cb: () => void): () => void {
    if (!subscriptionHandlers[event]) subscriptionHandlers[event] = new Set();
    subscriptionHandlers[event]!.add(cb);
    return () => subscriptionHandlers[event]!.delete(cb);
  }

  const queries: RouterQueries = {
    getRepos: () => call("getRepos") as ReturnType<RouterQueries["getRepos"]>,
    getLocations: () => call("getLocations") as ReturnType<RouterQueries["getLocations"]>,
    getCommits: (args) => call("getCommits", args) as ReturnType<RouterQueries["getCommits"]>,
    getCommitDetail: (args) =>
      call("getCommitDetail", args) as ReturnType<RouterQueries["getCommitDetail"]>,
    getPinnedRefs: () => call("getPinnedRefs") as ReturnType<RouterQueries["getPinnedRefs"]>,
  };

  const mutations: RouterMutations = {
    switchRepo: (args) => call("switchRepo", args) as ReturnType<RouterMutations["switchRepo"]>,
    action: (args) => call("action", args) as ReturnType<RouterMutations["action"]>,
    setPinnedRefs: (args) =>
      call("setPinnedRefs", args) as ReturnType<RouterMutations["setPinnedRefs"]>,
    focusCommit: (args) =>
      call("focusCommit", args) as ReturnType<RouterMutations["focusCommit"]>,
  };

  const subscriptions: RouterSubscriptions = {
    onRepoChanged: (cb) => subscribe("repoChanged", cb),
    onRepoListChanged: (cb) => subscribe("repoListChanged", cb),
  };

  return {
    queries,
    mutations,
    subscriptions,
    close: () => ws.close(),
  };
}
