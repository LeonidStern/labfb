# Changelog

Versions follow [semver](https://semver.org). Before 1.0, a minor version can change how things work.

## 0.5.0 · 2026-11-14

- The quick model is on by default when the `claude` command is installed (no `--fast` needed). `--no-fast` turns it off; without the command it stays off.
- Run it in your project: `npx @leonidstern/labfb`, no folder. With the project's dev server running, it puts comments on top of it by itself: it finds the server run from this folder (or one inside it), even with other projects' servers running. `--proxy` with no port does the same.
- A project with a dev server that isn't running is no longer served as a file listing of `src` and `node_modules`: it says to start the server, and names the other projects' servers it saw.
- README: local setup is one prompt to paste into Claude Code, like the cloud lab; the plugin is the shortcut for regular use. No `<folder>` placeholders. The skill starts labfb with no folder.
- A folder with no `index.html` at the top opens its first page (`public/index.html`, say) instead of a list of folders. The list at `/` shows every page with its title, and leaves out folders with no pages.
- `labfb pages`: every running lab's pages as a Markdown list in `.lab/lab-pages.md`, with open comment counts. Running labs register in `~/.labfb/servers/` (removed on exit), and each lab answers `/_lab/pages` for this computer only. The skill sends the file to the person after starting a lab, so it sits under Outputs in the desktop app.
- One lab per project: `labfb list` shows the labs running on this computer; starting a lab in a folder that a running lab already serves opens that lab instead (`--new` starts a separate one). The skill and the cloud setup prompt now check for an existing lab, project, page or session before creating one.
- `labfb add <url>` / `labfb remove <url>`: save cloud lab pages with the project (`.lab/links.json`). `pages` lists the project's labs and cloud pages, by domain with open comments; `pages --all` lists every lab on the computer.

## 0.4.0 · 2026-11-14

- Package: `npx @leonidstern/labfb <folder>`, `--version`, `npm test`, CI on Node 20, 22 and 24.
- Claude plugin: `/plugin marketplace add leonidstern/labfb`, then `/plugin install labfb@leonidstern`. The skill moved to `skills/labfb/`.
- Delete asks inside the card, not with the browser's dialog.
- Hold Option to comment on links and buttons, also while comments are hidden with `c`.
- Posting a new comment closes its card; the pin stays.
- Closing the page: Claude keeps waiting quietly and wakes on your next comment; after an hour with no page open, `wait` ends and says so. Tabs in the background count as open.
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
