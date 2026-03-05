import type { Router } from "./plan";
import { createVsCodeClient } from "./vscode-client";
import { createRpcWebSocketClient } from "./ws-client";

function hasVsCodeApi(): boolean {
  const g = globalThis as { acquireVsCodeApi?: unknown };
  return typeof g.acquireVsCodeApi === "function";
}

export function createWebSocketClient(url: string): Router & { close(): void } {
  if (hasVsCodeApi()) return createVsCodeClient();
  return createRpcWebSocketClient(url);
}
