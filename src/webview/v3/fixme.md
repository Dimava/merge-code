# FIXME

## Review Findings (2026-03-05)

- [P2] Watch all selectable repos instead of only `defaultRepo` (`src/webview/v3/server.ts:548`).
  The filesystem watcher is hardcoded to `defaultRepo`, so after switching to another repo tab, external Git changes in that active repo never emit `repoChanged` and the UI stays stale until manual refresh.
  Watch all selectable repos (or rebind watcher on active repo change) so live updates continue to work after tab switches.

- [P2] Use unique file-row identity for working tree entries (`src/webview/v3/CommitDetail.vue:110`).
  Using `f.path` as the row key and expansion key breaks when the same file appears in both staged and unstaged sections for partially staged changes.
  Use a unique key per row (for example include section/stage in the identity) so expansion state and diff rendering stay correct.

- [P3] Avoid shipping UnoCSS runtime when no utility classes are used (`src/webview/v3/index.html:7`).
  Adding `@unocss/runtime/uno.global.js` and the reset stylesheet makes Bun bundle extra runtime/reset payload into `index-q*.js/css` for every webview load, but the current v3 templates use only component-scoped classes, so this adds startup cost without functional benefit.
  Remove these includes (or switch to build-time UnoCSS generation when utility classes are actually introduced) to keep the panel lightweight.

- [P3] Keep commit date visible when decorations are present (`src/webview/v3/CommitList.vue:117`).
  Changing the date node to `v-else-if` hides the timestamp for any row that has refs (`row.commit.deco.length`), so decorated commits lose date information entirely.
  Render the date independently (or alongside decorations) so branch/tag labels do not suppress commit time metadata.
