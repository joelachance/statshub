/**
 * Collects coding-agent activity into a single snapshot.
 *
 * Shared by the local script and the published CLI. GitHub is reached over
 * plain fetch with a bearer token rather than the `gh` binary, so this runs
 * anywhere once the user has authenticated.
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const HOME = homedir();
const DAYS = 364; // GitHub caps the contributions window at 1 year; 52 weeks keeps us inside it

const CLAUDE_DIR = path.join(HOME, ".claude", "projects");
const CODEX_DIR = path.join(HOME, ".codex", "sessions");
const CURSOR_DB = (() => {
  // Cursor stores its state in the usual per-platform application-data folder.
  const rel = ["User", "globalStorage", "state.vscdb"];
  const roots = process.platform === "darwin"
    ? [path.join(HOME, "Library", "Application Support", "Cursor")]
    : process.platform === "win32"
      ? [path.join(process.env.APPDATA || path.join(HOME, "AppData", "Roaming"), "Cursor")]
      : [path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, ".config"), "Cursor")];
  for (const r of roots) {
    const p = path.join(r, ...rel);
    if (existsSync(p)) return p;
  }
  return path.join(roots[0], ...rel);
})();

let log = () => {};
export function setLogger(fn) { log = fn; }

/* ---------- helpers ---------- */

const dayKey = (d) => {
  // Local-time day bucket, so "prompts per day" matches the user's own days.
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

async function eachLine(file, fn) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line[0] !== "{") continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    fn(rec);
  }
}

// A day bucket accumulator shared by every source.
function newDays() { return new Map(); }
const DAY_FIELDS = ["prompts", "tokens", "input", "output", "cached", "contributions", "linesAccepted"];

function bump(days, key, field, n = 1) {
  if (!key || !n) return;
  // Guard: a typo here used to become `undefined + n` = NaN, which is falsy and
  // silently vanished a whole source from the grid. Fail loudly instead.
  if (!DAY_FIELDS.includes(field)) throw new Error(`bump(): unknown field "${field}"`);
  let d = days.get(key);
  if (!d) { d = Object.fromEntries(DAY_FIELDS.map((f) => [f, 0])); days.set(key, d); }
  d[field] += n;
}

/* ---------- Claude Code ---------- */

async function collectClaude() {
  const files = walk(CLAUDE_DIR, ".jsonl");
  log(`  claude: ${files.length} session files`);
  const days = newDays();
  const seenReq = new Set();   // dedupe identical usage across a request's records
  const projects = new Set();
  const models = new Map();
  let prompts = 0, input = 0, output = 0, cached = 0, sessions = 0;

  for (const f of files) {
    let fileHadActivity = false;
    await eachLine(f, (r) => {
      const k = dayKey(r.timestamp);
      if (!k) return;

      if (r.type === "user" && !r.isMeta && !r.isSidechain) {
        // Real prompts are plain strings or text blocks; tool_result records
        // are the agent feeding itself and must not count as prompts.
        const c = r.message?.content;
        const isPrompt = typeof c === "string"
          ? c.trim().length > 0
          : Array.isArray(c) && c.some((b) => b?.type === "text");
        if (isPrompt) { prompts++; bump(days, k, "prompts"); fileHadActivity = true; }
      }

      if (r.type === "assistant" && r.message?.usage) {
        const rid = r.requestId;
        if (rid) { if (seenReq.has(rid)) return; seenReq.add(rid); }
        const u = r.message.usage;
        const i = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        const o = u.output_tokens || 0;
        const ch = u.cache_read_input_tokens || 0;
        input += i; output += o; cached += ch;
        bump(days, k, "input", i); bump(days, k, "output", o); bump(days, k, "cached", ch);
        bump(days, k, "tokens", i + o);
        if (r.message.model) models.set(r.message.model, (models.get(r.message.model) || 0) + o);
        fileHadActivity = true;
      }

      if (r.cwd) projects.add(r.cwd);
    });
    if (fileHadActivity) { sessions++; }
  }

  return {
    tool: "Claude Code", days,
    totals: { prompts, input, output, cached, tokens: input + output, sessions, projects: projects.size },
    models: [...models.entries()].sort((a, b) => b[1] - a[1]).map(([name, out]) => ({ name, output: out })),
  };
}

/* ---------- Codex ---------- */

async function collectCodex() {
  const files = walk(CODEX_DIR, ".jsonl");
  log(`  codex: ${files.length} session files`);
  const days = newDays();
  let prompts = 0, input = 0, output = 0, cached = 0, sessions = 0;

  for (const f of files) {
    let active = false;
    await eachLine(f, (r) => {
      const p = r.payload; if (!p) return;
      const k = dayKey(r.timestamp); if (!k) return;

      if (p.type === "user_message") { prompts++; bump(days, k, "prompts"); active = true; }

      if (p.type === "token_count") {
        // Deltas, not the cumulative running total.
        const u = p.info?.last_token_usage; if (!u) return;
        const i = u.input_tokens || 0, o = u.output_tokens || 0, ch = u.cached_input_tokens || 0;
        // Codex counts cached reads inside input_tokens; keep them separate
        // so "tokens" means the same thing it does for Claude.
        const billedIn = Math.max(0, i - ch);
        input += billedIn; output += o; cached += ch;
        bump(days, k, "input", billedIn); bump(days, k, "output", o); bump(days, k, "cached", ch);
        bump(days, k, "tokens", billedIn + o);
        active = true;
      }
    });
    if (active) sessions++;
  }

  return { tool: "Codex", days, totals: { prompts, input, output, cached, tokens: input + output, sessions } };
}

/* ---------- Cursor ---------- */

function sqlite(db, sql) {
  try {
    return execFileSync("sqlite3", ["-readonly", "-json", db, sql], {
      encoding: "utf8", maxBuffer: 1024 * 1024 * 512,
    });
  } catch (e) {
    log(`  cursor: query failed — ${e.message.split("\n")[0]}`);
    return "";
  }
}

function collectCursor() {
  const days = newDays();
  const totals = { prompts: 0, tokens: 0, input: 0, output: 0, cached: 0, sessions: 0, linesAccepted: 0, linesSuggested: 0 };
  if (!existsSync(CURSOR_DB)) { log("  cursor: no state.vscdb, skipping"); return { tool: "Cursor", days, totals, tokensUnavailable: true }; }

  log(`  cursor: reading ${(statSync(CURSOR_DB).size / 1e9).toFixed(1)} GB store (this is the slow one)`);

  // Per-day accepted/suggested lines — Cursor keeps these pre-aggregated.
  const daily = sqlite(CURSOR_DB, `SELECT key, value FROM ItemTable WHERE key LIKE 'aiCodeTracking.dailyStats%';`);
  if (daily.trim()) {
    for (const row of JSON.parse(daily)) {
      let v; try { v = JSON.parse(row.value); } catch { continue; }
      if (!v?.date) continue;
      const acc = (v.composerAcceptedLines || 0) + (v.tabAcceptedLines || 0);
      const sug = (v.composerSuggestedLines || 0) + (v.tabSuggestedLines || 0);
      bump(days, v.date, "linesAccepted", acc);
      totals.linesAccepted += acc; totals.linesSuggested += sug;
    }
  }

  // Prompts: bubbles with type=1 are user turns. Bubbles carry no timestamp,
  // so date each one by its parent conversation's createdAt.
  const convo = sqlite(CURSOR_DB, `
    SELECT substr(key, 14) AS id, json_extract(value,'$.createdAt') AS createdAt
    FROM cursorDiskKV WHERE key LIKE 'composerData:%';`);
  const created = new Map();
  if (convo.trim()) for (const r of JSON.parse(convo)) if (r.createdAt) created.set(r.id, Number(r.createdAt));
  totals.sessions = created.size;

  const bubbles = sqlite(CURSOR_DB, `
    SELECT substr(key, 10, instr(substr(key,10), ':') - 1) AS cid, COUNT(*) AS n
    FROM cursorDiskKV
    WHERE key LIKE 'bubbleId:%' AND json_extract(value,'$.type') = 1
    GROUP BY cid;`);
  if (bubbles.trim()) {
    for (const r of JSON.parse(bubbles)) {
      const n = Number(r.n) || 0;
      totals.prompts += n;
      const ts = created.get(r.cid);
      if (ts) bump(days, dayKey(ts), "prompts", n);
    }
  }

  return { tool: "Cursor", days, totals, tokensUnavailable: true };
}

/* ---------- GitHub ---------- */

const GH_API = "https://api.github.com";

function makeGitHub(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "statshub",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  async function rest(pathname) {
    const r = await fetch(`${GH_API}${pathname}`, { headers });
    if (!r.ok) throw new Error(`GitHub ${r.status} on ${pathname}`);
    return r.json();
  }

  async function graphql(query, variables) {
    const r = await fetch(`${GH_API}/graphql`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (j.errors?.length) throw new Error(j.errors[0].message);
    return j.data;
  }

  /** Search sees private repositories the token can read, unlike the typed
   *  contribution counters, which are public-only. */
  async function count(kind, q) {
    try {
      const j = await rest(`/search/${kind}?q=${encodeURIComponent(q)}&per_page=1`);
      return j.total_count ?? null;
    } catch { return null; }
  }

  return { rest, graphql, count };
}

export async function collectGitHub(token) {
  const days = newDays();
  const totals = {
    commits: 0, commitsAllTime: 0, prs: 0, prsMerged: 0, prsAllTime: 0,
    contributions: 0, privateContributions: 0, publicCommits: 0,
    reviews: 0, issues: 0, repos: 0, followers: 0,
  };
  const repoBreakdown = [];
  let login = "", name = "", avatar = "", bio = "";

  if (!token) return { tool: "GitHub", days, totals, unavailable: true, login, name, avatar, bio, repoBreakdown };

  const api = makeGitHub(token);
  const me = await api.rest("/user");
  login = me.login; name = me.name || me.login; avatar = me.avatar_url; bio = me.bio || "";
  totals.followers = me.followers || 0;

  const from = new Date(); from.setDate(from.getDate() - DAYS);
  const sinceDay = dayKey(from);

  const query = `
    query($login:String!, $from:DateTime!, $to:DateTime!) {
      user(login:$login) {
        contributionsCollection(from:$from, to:$to) {
          totalCommitContributions
          totalPullRequestReviewContributions
          totalIssueContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
          commitContributionsByRepository(maxRepositories:100) {
            repository { nameWithOwner isPrivate stargazerCount primaryLanguage { name } }
            contributions { totalCount }
          }
        }
      }
    }`;

  let calendarDays = [];
  try {
    const d = await api.graphql(query, {
      login, from: from.toISOString(), to: new Date().toISOString(),
    });
    const cc = d.user.contributionsCollection;

    totals.publicCommits = cc.totalCommitContributions;
    totals.reviews = cc.totalPullRequestReviewContributions;
    totals.issues = cc.totalIssueContributions;
    totals.privateContributions = cc.restrictedContributionsCount || 0;
    totals.contributions = cc.contributionCalendar.totalContributions;

    for (const w of cc.contributionCalendar.weeks)
      for (const day of w.contributionDays) {
        calendarDays.push(day.date);
        if (day.contributionCount) bump(days, day.date, "contributions", day.contributionCount);
      }

    for (const r of cc.commitContributionsByRepository) {
      const priv = r.repository.isPrivate;
      repoBreakdown.push({
        // Private repositories are never named. Their commits still count
        // toward the headline totals; only the identity is withheld.
        name: priv ? "Private repository" : r.repository.nameWithOwner,
        private: priv,
        commits: r.contributions.totalCount,
        stars: priv ? 0 : r.repository.stargazerCount,
        language: priv ? null : (r.repository.primaryLanguage?.name || null),
      });
    }
    repoBreakdown.sort((a, b) => b.commits - a.commits);
    totals.repos = repoBreakdown.length;
  } catch (e) {
    log(`  github: contributions query failed — ${e.message}`);
  }

  const [commitsWindow, prsWindow, prsMerged, commitsAll, prsAll] = await Promise.all([
    api.count("commits", `author:${login} committer-date:>=${sinceDay}`),
    api.count("issues", `is:pr author:${login} created:>=${sinceDay}`),
    api.count("issues", `is:pr author:${login} is:merged created:>=${sinceDay}`),
    api.count("commits", `author:${login}`),
    api.count("issues", `is:pr author:${login}`),
  ]);

  totals.commits = commitsWindow ?? totals.publicCommits;
  totals.commitsAllTime = commitsAll ?? 0;
  totals.prs = prsWindow ?? 0;
  totals.prsMerged = prsMerged ?? 0;
  totals.prsAllTime = prsAll ?? 0;

  return { tool: "GitHub", days, totals, login, name, avatar, bio, repoBreakdown, calendarDays };
}

/* ---------- assemble ---------- */

function buildCalendar(sources, ghDays) {
  // Prefer GitHub's own week grid: it is already Sunday-aligned and exactly
  // matches what an employer sees on the public profile.
  let dates = ghDays && ghDays.length >= 300 ? ghDays.slice() : null;

  if (!dates) {
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - (DAYS - 1));
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    dates = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(dayKey(d));
  }

  return dates.map((k) => {
    const cell = { date: k, prompts: 0, tokens: 0, contributions: 0, byTool: {} };
    for (const s of sources) {
      const v = s.days.get(k); if (!v) continue;
      cell.prompts += v.prompts;
      cell.tokens += v.tokens;
      cell.contributions += v.contributions || 0;
      const slug = s.tool.toLowerCase().split(" ")[0];
      if (v.prompts || v.tokens) cell.byTool[slug] = { prompts: v.prompts, tokens: v.tokens };
    }
    cell.score = cell.prompts + cell.contributions;
    return cell;
  });
}

function streaks(cal) {
  let run = 0, longest = 0, activeDays = 0;
  for (const c of cal) {
    if (c.score > 0) { run++; activeDays++; longest = Math.max(longest, run); }
    else run = 0;
  }
  // Current streak counts back from today; an idle today doesn't break it yet.
  let current = 0;
  for (let i = cal.length - 1; i >= 0; i--) {
    if (cal[i].score > 0) current++;
    else if (i === cal.length - 1) continue;
    else break;
  }
  return { current, longest, activeDays };
}


/** Build one complete snapshot. `token` is a GitHub OAuth/PAT token. */
export async function collect({ token, skipCursor = false } = {}) {
  const claude = await collectClaude();
  const codex = await collectCodex();
  const cursor = skipCursor
    ? { tool: "Cursor", days: newDays(), totals: { prompts: 0, tokens: 0, cached: 0, sessions: 0, linesAccepted: 0 }, tokensUnavailable: true }
    : collectCursor();
  const github = await collectGitHub(token);

  const agents = [claude, codex, cursor];
  const calendar = buildCalendar([...agents, github], github.calendarDays);
  const st = streaks(calendar);

  const tokens = agents.reduce((n, s) => n + (s.totals.tokens || 0), 0);
  const cachedTokens = agents.reduce((n, s) => n + (s.totals.cached || 0), 0);
  const promptsAllTime = agents.reduce((n, s) => n + (s.totals.prompts || 0), 0);
  const sessions = agents.reduce((n, s) => n + (s.totals.sessions || 0), 0);

  const promptDays = calendar.filter((c) => c.prompts > 0).length;
  const windowPrompts = calendar.reduce((n, c) => n + c.prompts, 0);
  const peak = calendar.reduce((m, c) => (c.prompts > m.prompts ? c : m), calendar[0]);

  return {
    generatedAt: new Date().toISOString(),
    slug: (github.login || "local").toLowerCase(),
    windowDays: calendar.length,
    windowStart: calendar[0]?.date,
    windowEnd: calendar[calendar.length - 1]?.date,
    profile: { name: github.name || "", login: github.login || "", avatar: github.avatar || "", bio: github.bio || "" },
    headline: {
      tokens, cachedTokens,
      prompts: windowPrompts, promptsAllTime, sessions,
      commits: github.totals.commits,
      commitsAllTime: github.totals.commitsAllTime,
      publicCommits: github.totals.publicCommits,
      privateContributions: github.totals.privateContributions,
      contributions: github.totals.contributions,
      prs: github.totals.prs,
      prsMerged: github.totals.prsMerged,
      prsAllTime: github.totals.prsAllTime,
      reviews: github.totals.reviews,
      repos: github.totals.repos,
      promptsPerPromptDay: promptDays ? +(windowPrompts / promptDays).toFixed(1) : 0,
      promptDays,
      peakDay: peak ? { date: peak.date, prompts: peak.prompts } : null,
      ...st,
    },
    tools: [
      { slug: "claude", label: "Claude Code", ...claude.totals, models: claude.models },
      { slug: "codex", label: "Codex", ...codex.totals },
      { slug: "cursor", label: "Cursor", ...cursor.totals, tokensUnavailable: true },
      { slug: "github", label: "GitHub", ...github.totals, unavailable: !!github.unavailable },
    ],
    calendar,
    repos: github.repoBreakdown.slice(0, 10),
  };
}
