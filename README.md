# statshub

A single dashboard aggregating engineering activity across **Claude Code**, **Codex**,
**Cursor** and **GitHub** — built to show employers what a year of work actually looks like.

Contribution heatmap, total token burn, prompts per day, commits and PRs. Dark, clean, fast.

## The command

```
npx statshub
```

That is the whole interface. It reads your local agent logs, pulls your GitHub activity,
and uploads the result to the server, which publishes it at `/<your-github-login>`.

The first run shows a one-time GitHub code to confirm who you are — the server derives your
page's slug from the verified account, so nobody can publish numbers under your name. The
token is cached at `~/.statshub.json` (mode 600); later runs just upload. If it is ever
revoked, the next run notices and asks again.

| Flag | |
| --- | --- |
| `--private` | count private commits and PRs too (asks for the broader `repo` scope) |
| `--dry-run` | collect and print, upload nothing |
| `--out FILE` | also write the snapshot to a file |
| `--skip-cursor` | skip Cursor's multi-GB scan |
| `--server URL` | override the destination |

By default only public activity is counted. `--private` needs the classic `repo` scope,
which grants read/write to your repositories; the token is sent to the server once to
prove who you are and is never stored there. If that trade is not worth it, stay on the
default and accept public-only counts.

## Data sources

| Source | Where | Prompts | Tokens |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` | `type:"user"` records with string/text content | `message.usage`, deduped by `requestId` |
| Codex | `~/.codex/sessions/**/*.jsonl` | `payload.type == "user_message"` | `token_count` → `info.last_token_usage` deltas |
| Cursor | `state.vscdb` in the platform's app-data folder | `bubbleId:` rows with `type == 1` | not exposed by Cursor |
| GitHub | REST + GraphQL, with your token | — | — |

### Counting rules that matter

These are the traps that silently produce wrong headline numbers:

- **Claude repeats one `usage` object across every assistant record in a single API
  request.** Summing them inflated the real total by **3.2×** on the original dataset
  (4.17M → 1.30M output tokens in one file). One row per `requestId` is kept.
- **Codex `total_token_usage` is cumulative per session**, so summing it across records
  produced **519 billion** tokens against a true ~378M. `last_token_usage` deltas are
  summed instead.
- **`tool_result` records are not prompts.** In a sampled Claude session only 43 of 859
  `type:"user"` records were real prompts; the other 816 were the agent feeding itself.
- **GitHub's typed contribution counters are public-only.** They reported 637 commits
  where authenticated commit search — which sees private repos — found **2,938**.
- **GitHub caps the contributions window at one year.** Requesting 371 days fails
  validation, so the window is 364 days and the grid reuses GitHub's own Sunday-aligned weeks.

Cursor exposes no token counts, so the dashboard shows a dash rather than inventing one.
Private repositories are never named; their commits still count toward the totals.

## Identity

The server never trusts a username in the request body. It resolves the account from the
bearer token via GitHub and writes to that slug:

```
POST /api/sync   body: {"slug":"torvalds", "profile":{"name":"Linus"}}
                 →    {"ok":true, "slug":"joelachance"}
```

Slug, login, display name, avatar and bio all come from the authenticated account, so a
snapshot can only land on the publisher's own page under their real name. Publishing is
limited to once a minute per account, and payloads are size-capped and field-filtered
before storage.

## Setup

1. **Database** — create a Neon project and copy the **pooled** connection string (the
   host containing `-pooler`, which keeps serverless invocations from exhausting the
   connection limit). Set it as `DATABASE_URL`. The table is created on first use.

2. **GitHub OAuth App** — <https://github.com/settings/developers> → New OAuth App. Any
   homepage and callback URL will do; device flow does not use the callback. Enable
   **Device Flow** in the app's settings, then copy the **Client ID** — it is public, and
   no client secret is needed.

3. **Deploy**
   ```
   npx vercel
   ```
   Set `DATABASE_URL` in the Vercel project's environment variables.

4. **Ship the command** — set `STATSHUB_CLIENT_ID` in `bin/statshub.mjs` (or leave it as an
   environment variable) and `npm publish`. Until then it runs from a clone:
   ```
   STATSHUB_CLIENT_ID=<client-id> STATSHUB_SERVER=https://your-app.vercel.app npm run statshub
   ```

## Scheduled uploads

A launchd agent can re-publish on a schedule. launchd rather than cron — cron is
deprecated on macOS and more often needs Full Disk Access.

```
STATSHUB_CLIENT_ID=<id> STATSHUB_SERVER=https://your-app.vercel.app ./scripts/schedule.sh install
./scripts/schedule.sh status
./scripts/schedule.sh run          # trigger now
./scripts/schedule.sh logs
./scripts/schedule.sh uninstall
```

`STATSHUB_HOUR` and `STATSHUB_MINUTE` change the time (default 09:00).

Notes:

- launchd runs without a login shell, so tool paths are resolved at install time and baked
  into the plist. If node is managed by nvm its path contains the version number, so
  **re-run `install` after upgrading node**.
- A lock directory prevents overlapping runs; the Cursor scan takes minutes.
- Logs go to `~/Library/Logs/statshub-sync.log`.
- The job only runs while the Mac is awake; a missed run is picked up the next day.

## Local development

```
echo 'DATABASE_URL=postgres://localhost:5432/statshub' > .env.local
npm run dev
npm run statshub -- --server http://localhost:3000 --skip-cursor
```

`npm run verify` production-builds into a separate directory, so it cannot clobber a
running dev server's `.next` output.
