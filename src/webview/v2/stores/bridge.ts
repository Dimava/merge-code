import type { WebviewMessage } from "../types";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

export function post(msg: WebviewMessage) {
  vscode.postMessage(JSON.parse(JSON.stringify(msg)));
}

function toCloneSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const replacer = (_key: string, v: unknown) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      if (v instanceof Set) return { type: "Set", values: [...v] };
      if (v instanceof Map) return { type: "Map", entries: [...v.entries()] };
    }
    if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "bigint") return v.toString();
    return v;
  };
  try {
    return JSON.parse(JSON.stringify(value, replacer)) as unknown;
  } catch {
    return String(value);
  }
}

export function webviewLog(
  message: string,
  data?: unknown,
  level: "info" | "warn" | "error" = "info",
) {
  const payload: WebviewMessage = {
    type: "webviewLog",
    level,
    message,
    data: toCloneSafe(data),
  };
  try {
    vscode.postMessage(payload);
  } catch (err) {
    try {
      vscode.postMessage({
        type: "webviewLog",
        level: "error",
        message: "webviewLog:postMessage-failed",
        data: { originalMessage: message, error: String(err) },
      });
    } catch {
      /* swallow */
    }
  }
}
