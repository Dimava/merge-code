import type {
  RouterQueries,
  RouterMutations,
  RouterSubscriptions,
  Router,
  RepoInfo,
  LocationsData,
  CommitEntry,
  CommitDetail,
  Filters,
} from "./plan";

type RpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type RpcResponse = {
  id: number;
  result?: unknown;
  error?: string;
};

type SubscriptionMessage = {
  type: "subscription";
  event?: string;
};

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRpcResponse(message: unknown): message is RpcResponse {
  if (!isRecord(message)) return false;
  return typeof message.id === "number" && ("result" in message || "error" in message);
}

function isSubscriptionMessage(message: unknown): message is SubscriptionMessage {
  return isRecord(message) && message.type === "subscription";
}

function normalizeFilters(filters: Filters): Record<string, string[]> {
  return {
    hiddenCategories: [...filters.hiddenCategories],
    hiddenRefs: [...filters.hiddenRefs],
    pinnedRefs: [...filters.pinnedRefs],
    expandedMerges: [...filters.expandedMerges],
  };
}

export function createRpcWebSocketClient(url: string): Router & { close(): void } {
  const socket = new WebSocket(url);
  const pending = new Map<number, PendingCall>();
  const repoChangedHandlers = new Set<() => void>();
  const repoListChangedHandlers = new Set<() => void>();

  let requestId = 1;
  let disposed = false;
  let didOpen = false;
  let settleOpen: ((value: void) => void) | null = null;
  let settleOpenError: ((reason?: unknown) => void) | null = null;
  const openPromise = new Promise<void>((resolve, reject) => {
    settleOpen = resolve;
    settleOpenError = reject;
  });

  function rejectAllPending(message: string) {
    const error = new Error(message);
    for (const call of pending.values()) {
      call.reject(error);
    }
    pending.clear();
  }

  function tryParseMessage(data: unknown): unknown {
    if (typeof data !== "string") return null;
    try {
      return JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }

  socket.addEventListener("open", () => {
    didOpen = true;
    settleOpen?.();
  });

  socket.addEventListener("error", () => {
    if (!didOpen) settleOpenError?.(new Error(`WebSocket connection failed: ${url}`));
  });

  socket.addEventListener("close", () => {
    if (!didOpen) settleOpenError?.(new Error(`WebSocket closed before opening: ${url}`));
    if (!disposed) rejectAllPending("WebSocket connection closed");
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    const message = tryParseMessage(event.data);
    if (!message) return;

    if (isSubscriptionMessage(message)) {
      if (message.event === "repoListChanged") {
        repoListChangedHandlers.forEach((cb) => cb());
      } else {
        repoChangedHandlers.forEach((cb) => cb());
      }
      return;
    }

    if (!isRpcResponse(message)) return;
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);

    if (typeof message.error === "string" && message.error.length > 0) {
      call.reject(new Error(message.error));
      return;
    }
    call.resolve(message.result);
  });

  async function request<T>(method: string, params?: unknown): Promise<T> {
    if (disposed) throw new Error("Client is closed");
    await openPromise;
    const id = requestId++;
    const payload: RpcRequest = params === undefined ? { id, method } : { id, method, params };
    return await new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      try {
        socket.send(JSON.stringify(payload));
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  const queries: RouterQueries = {
    getRepos() {
      return request<RepoInfo[]>("getRepos");
    },
    checkRepo(args) {
      return request<RepoInfo | null>("checkRepo", args);
    },
    getLocations(args) {
      return request<LocationsData>("getLocations", args);
    },
    getCommits(args) {
      return request<CommitEntry[]>("getCommits", {
        ...args,
        filters: normalizeFilters(args.filters),
      });
    },
    getCommitDetail(args) {
      return request<CommitDetail>("getCommitDetail", args);
    },
    getPinnedRefs(args) {
      return request<string[]>("getPinnedRefs", args);
    },
  };

  const mutations: RouterMutations = {
    action(args) {
      return request<void>("action", args);
    },
    setPinnedRefs(args) {
      return request<void>("setPinnedRefs", args);
    },
    focusCommit(args) {
      return request<CommitEntry[]>("focusCommit", args);
    },
  };

  const subscriptions: RouterSubscriptions = {
    onRepoChanged(cb) {
      repoChangedHandlers.add(cb);
      return () => repoChangedHandlers.delete(cb);
    },
    onRepoListChanged(cb) {
      repoListChangedHandlers.add(cb);
      return () => repoListChangedHandlers.delete(cb);
    },
  };

  return {
    queries,
    mutations,
    subscriptions,
    close() {
      if (disposed) return;
      disposed = true;
      rejectAllPending("Client closed");
      repoChangedHandlers.clear();
      repoListChangedHandlers.clear();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    },
  };
}
