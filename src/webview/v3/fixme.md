# Fixme

- [P1] `tsconfig.json` sets `"noEmit": true`, so `bun run compile` no longer emits `out/*.js` and packaging/run can fail on a clean checkout.
- [P3] `src/webview/v3/server.ts` counts untracked lines via `content.split("\n").length`, which returns `1` for an empty file (should be `0`).
