# Review findings

- [P1] `src/webview/v3/RefItem.vue`: the click binding is `@click="hash ? () => void store.selectCommit(hash) : undefined"`, which returns a function instead of calling it. As a result, clicking branch/remote/head `RefItem` rows does not select commits.
- [P0] `src/webview/v3/client.ts` is removed in the staged diff, but `src/webview/v3/store.ts` still imports `createWebSocketClient` from `"./client"`; a clean checkout will fail to type-check/build with `Cannot find module './client'`.
- [P1] `watchRepo()` posts the `subscription` event before async `sendLocations()` / `sendCommits()` finish, while `getLocations()` / `getCommits()` in `vscode-client.ts` return cached `last*` payloads when present; on repo changes this can refresh the UI with stale snapshots and miss the newly pushed data.
- [P1] `package.json` changed `compile` to only build webview assets, so extension host code in `out/*.js` is no longer rebuilt from `src/*.ts`; packaging can silently ship stale `panel.js` / `extension.js` that no longer matches the new webview protocol.
- [P2] `parseDecorations()` treats any ref containing `/` as remote; local branch names like `feature/foo` are misclassified as `remote`, which breaks branch-focused keys/actions (`remote:feature/foo` instead of `branch:feature/foo`).
- [P2] `getCommitDetail()` falls back to `lastDetail` on timeout; if a detail request is slow or misses the predicate, the UI can show the previous commit’s detail under the newly selected commit.
