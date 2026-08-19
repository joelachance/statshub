# statshub

A single dashboard aggregating engineering activity across **Claude Code**, **Codex**,
**Cursor** and **GitHub** — built to show employers what a year of work actually looks like.

Contribution heatmap, total token burn, prompts per day, commits and PRs. Dark, static, fast.

## How it works

The agent logs live on your machine, so a serverless deploy can't read them. Collection
therefore runs locally and commits a snapshot:

```
npm run sync      # reads local logs + GitHub, writes data/users/<login>.json
npm run dev       # preview at localhost:3000
```

Each sync writes one snapshot keyed by GitHub login, and that login is the URL slug:
`/joelachance`. Snapshots are committed and the pages are prerendered at build time.

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

## Deploy

File mode needs nothing but a deploy:

```
npx vercel
```

Hosted setup, so other people can publish:

1. **Create a GitHub OAuth App** — <https://github.com/settings/developers> → New OAuth App.
   Any homepage/callback URL works; device flow does not use the callback. Then enable
   **Device Flow** in the app's settings. Copy the **Client ID** (it is public, no secret needed).
2. **Create a Blob store** — Vercel dashboard → Storage → Blob. Vercel injects
   `BLOB_READ_WRITE_TOKEN` automatically.
3. **Publish the CLI**, or have people run it from a clone:
   ```
   STATSHUB_CLIENT_ID=<client-id> STATSHUB_SERVER=https://your-app.vercel.app npm run cli login
   ```
   Baking the client id into `bin/statshub.mjs` before `npm publish` saves users a step.

## Refreshing

```
npm run sync && git commit -am "sync stats" && vercel --prod
```

`SKIP_CURSOR=1 npm run sync` skips Cursor's multi-GB SQLite scan during development.
Use `npm run verify` to production-build into a separate directory without disturbing a
running dev server.


## Two modes

The app runs the same either way; the storage backend is chosen at runtime.

**File mode** (default) — snapshots live in `data/users/<login>.json`, are committed,
and pages prerender at build time. No server, no database, and the git history doubles
as an audit trail.

**Hosted mode** — set `BLOB_READ_WRITE_TOKEN` and snapshots move to Vercel Blob.
Anyone can publish with the CLI, `/[username]` revalidates every 60s, and new profiles
appear without a redeploy.

## The CLI

```
npx statshub login          # GitHub device flow
npx statshub sync           # collect and publish
npx statshub sync --dry-run # collect and print, publish nothing
```

`login` requests `read:user` only, which counts public activity. Private commits and PRs
need the classic `repo` scope, so that is opt-in:

```
npx statshub login --include-private
```

Worth understanding before you use it: `repo` grants read/write to your repositories,
and the token is sent to the server to prove who you are. The server verifies it once
against GitHub and never stores it — but if you would rather not hand over a broad token,
stay on the default scope and accept public-only counts.

## Identity

The server never trusts a username in the request body. It resolves the account from the
bearer token via GitHub, and writes to that slug:

```
POST /api/sync   body: {"slug":"torvalds", "profile":{"name":"Linus"}}
                 →    {"ok":true, "slug":"joelachance"}
```

Slug, login, display name, avatar and bio all come from the authenticated account, so a
snapshot can only ever land on the publisher's own page under their real name. Publishing
is limited to once a minute per account, and payloads are size-capped and field-filtered
before storage.

## Scheduled sync

A launchd agent can refresh the snapshot automatically. launchd rather than cron —
cron is deprecated on macOS and more often needs Full Disk Access.

```
./scripts/schedule.sh install      # daily at 09:00
./scripts/schedule.sh status
./scripts/schedule.sh run          # trigger now
./scripts/schedule.sh logs
./scripts/schedule.sh uninstall
```

Options:

- `STATSHUB_HOUR=7 STATSHUB_MINUTE=30 ./scripts/schedule.sh install` to change the time.
- `STATSHUB_PUSH=1 ./scripts/schedule.sh install` to `git push` after a successful sync
  so Vercel redeploys. **Off by default** — nothing leaves the machine until you opt in.

Notes:

- launchd runs without a login shell, so tool paths are resolved at install time and
  baked into the plist. If node is managed by nvm its path contains the version number,
  so **re-run `install` after upgrading node**.
- A lock directory prevents overlapping runs; the Cursor scan takes minutes.
- Logs go to `~/Library/Logs/statshub-sync.log`.
- The job only runs while the Mac is awake. A missed run is picked up the next day.
