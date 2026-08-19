/**
 * Collects local coding-agent activity.
 *
 * Claude Code, Codex, Cursor, opencode and pi, all read from their on-disk
 * logs. GitHub is deliberately absent: the web app holds the GitHub token and
 * collects that side itself, so the CLI needs no credentials of its own.
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const HOME = homedir();
const DAYS = 364; // GitHub caps the contributions window at 1 year; 52 weeks keeps us inside it

const CLAUDE_DIR = path.join(HOME, ".claude", "projects");
const CODEX_DIR = path.join(HOME, ".codex", "sessions");
const OPENCODE_DIR = path.join(
  process.env.XDG_DATA_HOME || path.join(HOME, ".local", "share"), "opencode", "storage");
const PI_DIR = path.join(HOME, ".pi", "agent", "sessions");

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

/* ---------- opencode ---------- */

function collectOpencode() {
  // One JSON file per message, grouped into a directory per session.
  const files = walk(path.join(OPENCODE_DIR, "message"), ".json");
  log(`  opencode: ${files.length} message files`);
  const days = newDays();
  const sessions = new Set();
  let prompts = 0, input = 0, output = 0, cached = 0;

  for (const f of files) {
    let r;
    try { r = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    const k = dayKey(r.time?.created);
    if (!k) continue;
    sessions.add(r.sessionID || path.basename(path.dirname(f)));

    if (r.role === "user") { prompts++; bump(days, k, "prompts"); continue; }
    if (r.role !== "assistant" || !r.tokens) continue;

    const i = r.tokens.input || 0;
    // `reasoning` exceeds `output` on some records, so it is a sibling counter
    // rather than a subset — count both toward billed output.
    const o = (r.tokens.output || 0) + (r.tokens.reasoning || 0);
    const ch = r.tokens.cache?.read || 0;
    input += i; output += o; cached += ch;
    bump(days, k, "input", i); bump(days, k, "output", o); bump(days, k, "cached", ch);
    bump(days, k, "tokens", i + o);
  }

  return { tool: "opencode", days,
           totals: { prompts, input, output, cached, tokens: input + output, sessions: sessions.size } };
}

/* ---------- pi ---------- */

async function collectPi() {
  const files = walk(PI_DIR, ".jsonl");
  log(`  pi: ${files.length} session files`);
  const days = newDays();
  let prompts = 0, input = 0, output = 0, cached = 0, sessions = 0;

  for (const f of files) {
    let active = false;
    await eachLine(f, (r) => {
      if (r.type !== "message") return;
      const k = dayKey(r.timestamp); if (!k) return;
      const m = r.message; if (!m) return;

      // pi gives tool output its own role, so `user` is unambiguously a prompt.
      if (m.role === "user") { prompts++; bump(days, k, "prompts"); active = true; return; }
      if (m.role !== "assistant" || !m.usage) return;

      const i = m.usage.input || 0, o = m.usage.output || 0, ch = m.usage.cacheRead || 0;
      input += i; output += o; cached += ch;
      bump(days, k, "input", i); bump(days, k, "output", o); bump(days, k, "cached", ch);
      bump(days, k, "tokens", i + o);
      active = true;
    });
    if (active) sessions++;
  }

  return { tool: "pi", days,
           totals: { prompts, input, output, cached, tokens: input + output, sessions } };
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

/**
 * Collect every local agent into an uploadable payload.
 *
 * Deliberately has no notion of a user: the server attaches identity from the
 * push key, and merges in the GitHub half it collected itself.
 */
export async function collect({ skipCursor = false } = {}) {
  const claude = await collectClaude();
  const codex = await collectCodex();
  const opencode = collectOpencode();
  const pi = await collectPi();
  const cursor = skipCursor
    ? { tool: "Cursor", days: newDays(), totals: { prompts: 0, tokens: 0, cached: 0, sessions: 0, linesAccepted: 0 }, skipped: true }
    : collectCursor();

  const agents = [claude, codex, cursor, opencode, pi];

  return {
    collectedAt: new Date().toISOString(),
    windowDays: DAYS + 1,
    tools: [
      { slug: "claude", label: "Claude Code", ...claude.totals, models: claude.models },
      { slug: "codex", label: "Codex", ...codex.totals },
      { slug: "cursor", label: "Cursor", ...cursor.totals, tokensUnavailable: true, skipped: !!cursor.skipped },
      { slug: "opencode", label: "opencode", ...opencode.totals },
      { slug: "pi", label: "pi", ...pi.totals },
    ],
    // Day buckets keyed by date, merged with the GitHub calendar server-side.
    days: Object.fromEntries(
      [...agents.reduce((acc, a) => {
        for (const [k, v] of a.days) {
          const cur = acc.get(k) || { prompts: 0, tokens: 0, cached: 0 };
          cur.prompts += v.prompts; cur.tokens += v.tokens; cur.cached += v.cached;
          acc.set(k, cur);
        }
        return acc;
      }, new Map())].sort(([a], [b]) => a < b ? -1 : 1)
    ),
    byTool: Object.fromEntries(agents.map((a) => [
      a.tool.toLowerCase().replace(/\s+/g, ""),
      Object.fromEntries([...a.days].map(([k, v]) => [k, v.prompts])),
    ])),
  };
}
