# FIXME

## Review Findings (2026-03-05)

- [P2] Use a stable, real-time comparator for ref "time sort" (`src/webview/v3/Locations.vue:17`, `src/webview/v3/Locations.vue:35`).
  Current sorting compares relative-date strings (`a.date < b.date`) and never returns `0`, so equal/missing dates are reordered unpredictably and many values ("9 minutes ago" vs "12 minutes ago") are not sorted chronologically.
  Sort by a comparable timestamp value (or precomputed rank) and return `0` when dates are equal.

- [P2] Populate branch/remote dates before rendering time-sorted ref rows (`src/webview/v3/Locations.vue:66`, `src/webview/v3/Locations.vue:103`).
  Time-sort mode renders `b.date`/`item.date`, but current location payloads still provide branch names (and remote branch strings), so date cells are blank and ordering logic operates on missing values.
  Extend the locations RPC to include branch/remote branch dates consistently before exposing time sort in the sidebar.

- [P3] Wire tags sort toggle to actual tag ordering (`src/webview/v3/Locations.vue:114`).
  `sort-key="tags"` enables the header sort button, but the tag list always renders `store.locations.tags` in the same order and never checks `store.isTimeSorted("tags")`.
  Either add name/time sorting for tags or remove the sort affordance to avoid a no-op control.

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
