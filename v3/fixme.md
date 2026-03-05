# Review findings

- [P1] `src/webview/v3/RefItem.vue`: the click binding is `@click="hash ? () => void store.selectCommit(hash) : undefined"`, which returns a function instead of calling it. As a result, clicking branch/remote/head `RefItem` rows does not select commits.
