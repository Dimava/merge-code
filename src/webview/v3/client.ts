import type { RouterQueries, RouterMutations, RouterSubscriptions, Router } from "./plan";

type RpcRequest = { id: number; method: string; params?: unknown };
type RpcResponse = { id: number; result?: unknown; error?: string };

export function createWebSocketClient(url: string): Router & { close(): void } {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const subscriptionHandlers = new Map<string, Set<() => void>>();

  ws.addEventListener("message", (e) => {
    const msg: RpcResponse & { type?: string; event?: string } = JSON.parse(String(e.data));

    if (msg.type === "subscription") {
      const handlers = subscriptionHandlers.get(msg.event!);
      if (handlers) handlers.forEach((cb) => cb());
      return;
    }

    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  });

  function call<T>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      const msg: RpcRequest = { id, method, ...(params !== undefined && { params }) };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        ws.addEventListener("open", () => ws.send(JSON.stringify(msg)), { once: true });
      }
    });
  }

  function subscribe(event: string, cb: () => void): () => void {
    let set = subscriptionHandlers.get(event);
    if (!set) {
      set = new Set();
      subscriptionHandlers.set(event, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }

  function proxyGroup<T>(keys: (keyof T & string)[]): T {
    const obj = {} as Record<string, (args?: unknown) => Promise<unknown>>;
    for (const key of keys) {
      obj[key] = (args?: unknown) => call(key, args);
    }
    return obj as T;
  }

  const queries = proxyGroup<RouterQueries>([
    "getRepos",
    "checkRepo",
    "getLocations",
    "getCommits",
    "getCommitDetail",
    "getPinnedRefs",
  ]);

  const mutations = proxyGroup<RouterMutations>(["action", "setPinnedRefs", "focusCommit"]);

  const subscriptions: RouterSubscriptions = {
    onRepoChanged: (cb) => subscribe("repoChanged", cb),
    onRepoListChanged: (cb) => subscribe("repoListChanged", cb),
  };

  return { queries, mutations, subscriptions, close: () => ws.close() };
}
