# FIXME

## Review Findings (2026-03-05)

- [P2] Preserve secondary merge parent rows in collapsed view (`src/webview/CommitList.vue:107-109`).
  Collapsing currently hides secondary parent commits themselves, so selecting a secondary parent can point to a commit that has no visible row.
  Keep the secondary parent node visible in collapsed mode, or auto-expand the merge when that commit is focused.

- [P2] Continue selection fallback when focused hash is missing (`src/webview/v2/stores/commits.ts:26-35`).
  The current early return on `focusHash` skips fallback selection when the focused commit is absent from the payload.
  Only return early when a matching focus commit is found; otherwise continue normal visibility and fallback selection logic.
