# Changelog

Versions follow [semver](https://semver.org). Before 1.0, a minor version can change how things work.

## 0.4.0 · 2026-11-14

- Package: `npx @leonidstern/labfb <folder>`, `--version`, `npm test`, CI on Node 20, 22 and 24.
- Claude plugin: `/plugin marketplace add leonidstern/labfb`, then `/plugin install labfb@labfb`. The skill moved to `skills/labfb/`.
- Delete asks inside the card, not with the browser's dialog.
- Hold Option to comment on links and buttons, also while comments are hidden with `c`.
- Posting a new comment closes its card; the pin stays.
- Replies use the comment id (numbers shift after a delete).
- Fixed: an unknown option was read as a folder name; paths with spaces or on Windows.

## 0.3.0 · 2026-11-14

- Local mode on a running dev server: `--proxy <port>` (Astro, Next, Vite).
- New replies show in the open card; the reply box takes focus.
- The label says whether Claude is listening, working, or away.
- Thin dotted area line that shows on any page; smooth send arrow.

## 0.2.0 · 2026-11-14

- Drag your own pin to move it.
- `data-uncommentable` and `data-comment-target`, the same names as Claude artifact comments.
- `--fast`: a quick model tries small changes first.
- `preview <folder>` for the Claude desktop app's preview pane.

## 0.1.0 · 2026-11-14

- Local mode: comments on pages on your computer, `wait` and `reply` for Claude.
- Cloud lab: pin comments, agent text link, per-person admin links, paper look.
