# Agent readability benchmark

Can an agent find what a comment points at, from the link alone? One test page (`site/`) has a photo, a code file and a video. Three comments are pinned the way a person would: on the red circle, on `padding` in line 20 of `src/button.ts` (line 14 has the same text), and on the red box in the video at 5.4 s.

```
node bench/run.mjs                      # pins the comments, checks the agent link (needs playwright)
ARTIFACT_URL=<link> node bench/run.mjs  # also runs the same checks on a shared Claude artifact of the same page
node bench/score-agent.mjs <answer.json> # scores an agent's answer
```

## Results, 2026-11-13

**What the link gives an agent** (`run.mjs`, 8 checks: file, spot in original pixels, code line, video second)

| | lab agent link | shared artifact link |
|---|---|---|
| response | 1.8 KB plain text, ~460 tokens | 37 KB app shell |
| comments in it | 3 of 3 | 0 of 3 |
| checks passed | 8 / 8 | 0 / 8 |

The only text in the artifact response is "Claude Artifact Content is user-generated and unverified." The page and its comments load later, in a signed-in browser.

**Agents doing the work** (given the link and the repo, asked for file + line / pixel / second; `score-agent.mjs`)

| agent | lab link | artifact link (no login) |
|---|---|---|
| Claude Fable 5.2 | 7 / 7, all high confidence | 0 / 7: found 0 comments, "a 37 KB generic app shell" |
| Claude Sonnet | 7 / 7 | — |
| Claude Haiku | 7 / 7 | — |

All three found the red circle at 1896,400 of 2400×1600, line 20 (not 14), and the red box at 5.4 s, 1075,137 of 1280×720. Answers are in `results/`.

The benchmark also caught a gap: comments on code used to record only the nearby words, so an agent couldn't tell line 14 from line 20. They now record the line, its number and the block's label.
