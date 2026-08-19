# statshub

A single dashboard aggregating engineering activity across **Claude Code**, **Codex**,
**Cursor** and **GitHub** — built to show employers what a year of work actually looks like.

Contribution heatmap, total token burn, prompts per day, commits and PRs. Dark, clean, fast.

## How it splits

Two halves, collected by whoever is best placed to collect them.

**The web app owns GitHub.** You sign in with GitHub, and the server pulls your commits,
pull requests, reviews and contribution calendar itself. Nothing about GitHub happens on
your machine.

**The command owns your agents.** Your Claude Code, Codex, Cursor, opencode and pi logs
never leave your laptop except as the counted totals.

```
npx statshub sk_your_key      # first run — key comes from your dashboard
npx statshub                  # every run after that
```

The key is stored at `~/.statshub.json` (mode 600) and is the only credential the command
needs. It carries no GitHub access: if it leaks, the worst anyone can do is publish agent
numbers to your page, and pressing **New key** on your dashboard invalidates it instantly.

| Flag | |
| --- | --- |
| `--dry-run` | collect and print, upload nothing |
| `--out FILE` | also write the collected data to a file |
| `--skip-cursor` | skip Cursor's multi-GB scan |
| `--server URL` | override the destination |

Signing in requests `read:user`, which counts public activity only. **Include private** on
your dashboard re-authorises with the classic `repo` scope so commit search can see private
repositories — that scope grants read/write to your repos, so it stays a deliberate choice
rather than something asked for at sign-up. Private repositories are counted but never named.

## Data sources

| Source | Where | Prompts | Tokens |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` | `type:"user"` records with string/text content | `message.usage`, deduped by `requestId` |
| Codex | `~/.codex/sessions/**/*.jsonl` | `payload.type == "user_message"` | `token_count` → `info.last_token_usage` deltas |
| Cursor | `state.vscdb` in the platform's app-data folder | `bubbleId:` rows with `type == 1` | not exposed by Cursor |
| opencode | `~/.local/share/opencode/storage/message/**` | one JSON per message, `role == "user"` | `tokens.input` + `output` + `reasoning` |
| pi | `~/.pi/agent/sessions/**/*.jsonl` | `message.role == "user"` | `message.usage` |
| GitHub | REST + GraphQL, server-side | — | — |

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
- **opencode reports `reasoning` outside `output`.** It exceeds output on 271 of 2,762
  sampled assistant records, so it is a sibling counter and both count toward billed output.
  Its message ids are unique, so the Claude de-duplication does not apply.
- **GitHub search counts drift as the index catches up.** The same query returned 299 PRs
  one hour and 346 the next. They are GitHub's numbers, not ours, and stable on re-query.

Cursor exposes no token counts, so the dashboard shows a dash rather than inventing one.
Private repositories are never named; their commits still count toward the totals.

## Identity

Nothing in an upload decides whose page it lands on — the push key alone does:

```
POST /api/sync   Authorization: Bearer sk_…
                 →    {"ok":true, "slug":"joelachance"}
```

Slug, display name, avatar and bio all come from the GitHub account that signed in, so a
stolen payload cannot be republished under someone else's name. Keys are stored only as a
SHA-256 hash and compared in constant time, so a database leak cannot be replayed as an
upload. Uploads are limited to once a minute per account, size-capped, and field-filtered
before storage.

## Setup

1. **Database** — create a Neon project and copy the **pooled** connection string (the
   host containing `-pooler`, which keeps serverless invocations from exhausting the
   connection limit). Set it as `DATABASE_URL`. The table is created on first use.

2. **GitHub OAuth App** — <https://github.com/settings/developers> → New OAuth App. Set the
   callback URL to `https://your-app.vercel.app/api/auth/callback`. Copy the **Client ID**
   and generate a **Client Secret**.

3. **Environment** — set all four in Vercel and in `.env.local`:
   ```
   DATABASE_URL=postgres://…            # Neon, pooled
   GITHUB_CLIENT_ID=…
   GITHUB_CLIENT_SECRET=…
   SESSION_SECRET=…                     # openssl rand -hex 32
   ```

4. **Deploy**
   ```
   npx vercel
   ```

5. **Ship the command** — `npm publish`. Until then it runs from a clone:
   ```
   STATSHUB_SERVER=https://your-app.vercel.app npm run statshub -- sk_your_key
   ```

## Scheduled uploads

A launchd agent can re-publish on a schedule. launchd rather than cron — cron is
deprecated on macOS and more often needs Full Disk Access.

```
STATSHUB_KEY=sk_… STATSHUB_SERVER=https://your-app.vercel.app ./scripts/schedule.sh install
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
npm run dev
npm run statshub -- sk_your_key --server http://localhost:3000 --skip-cursor
```

`npm run verify` production-builds into a separate directory, so it cannot clobber a
running dev server's `.next` output.
