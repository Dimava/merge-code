# FIXME

## Review Findings (2026-03-05)

- [P2] Watch all selectable repos instead of only `defaultRepo` (`src/webview/v3/server.ts:548`).
  The filesystem watcher is hardcoded to `defaultRepo`, so after switching to another repo tab, external Git changes in that active repo never emit `repoChanged` and the UI stays stale until manual refresh.
  Watch all selectable repos (or rebind watcher on active repo change) so live updates continue to work after tab switches.

- [P2] Use unique file-row identity for working tree entries (`src/webview/v3/CommitDetail.vue:110`).
  Using `f.path` as the row key and expansion key breaks when the same file appears in both staged and unstaged sections for partially staged changes.
  Use a unique key per row (for example include section/stage in the identity) so expansion state and diff rendering stay correct.
