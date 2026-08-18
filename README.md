# statshub

A single dashboard aggregating engineering activity across **Claude Code**, **Codex**,
**Cursor** and **GitHub** — built to show employers what a year of work actually looks like.

Contribution heatmap, total token burn, prompts per day, commits and PRs. Dark, static, fast.

## How it works

The agent logs live on your machine, so a serverless deploy can't read them. Collection
therefore runs locally and commits a snapshot:

```
npm run sync      # reads local logs + GitHub, writes data/stats.json
npm run dev       # preview at localhost:3000
```

`data/stats.json` is committed, and the Next.js page renders it as a fully static page.
Re-run `npm run sync` and redeploy whenever you want fresh numbers.

## Data sources

| Source | Where | Prompts | Tokens |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` | `type:"user"` records with string/text content | `message.usage`, deduped by `requestId` |
| Codex | `~/.codex/sessions/**/*.jsonl` | `payload.type == "user_message"` | `token_count` → `info.last_token_usage` deltas |
| Cursor | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | `bubbleId:` rows with `type == 1` | not exposed by Cursor |
| GitHub | `gh` CLI (`gh auth login`) | — | — |

### Counting rules that matter

These are the traps that silently produce wrong headline numbers:

- **Claude repeats one `usage` object across every assistant record in a single API
  request.** Summing them inflated the real total by **3.2×** on this dataset
  (4.17M → 1.30M output tokens in one file). The collector keeps one row per `requestId`.
- **Codex `total_token_usage` is cumulative per session**, so summing it across records
  produced **519 billion** tokens against a true ~378M. The collector sums
  `last_token_usage` deltas instead.
- **`tool_result` records are not prompts.** In a sampled Claude session only 43 of 859
  `type:"user"` records were real prompts; the other 816 were the agent feeding itself.
- **GitHub's typed contribution counters are public-only.** They reported 637 commits
  where authenticated commit search — which sees private repos — found **2,938**.
  `restrictedContributionsCount` confirmed 3,512 contributions were private.
- **GitHub caps the contributions window at one year.** Requesting 371 days fails
  validation, so the window is 364 days and the grid reuses GitHub's own Sunday-aligned weeks.

Cursor exposes no token counts, so the dashboard shows a dash rather than inventing one.

## Deploy to Vercel

```
npm i -g vercel && vercel
```

No environment variables and no runtime data access — the committed JSON is the whole
dataset, so the page is prerendered at build time.

## Refreshing

```
npm run sync && git commit -am "sync stats" && vercel --prod
```

`SKIP_CURSOR=1 npm run sync` skips Cursor's multi-GB SQLite scan during development.
Use `npm run verify` to production-build into a separate directory without disturbing a
running dev server.
