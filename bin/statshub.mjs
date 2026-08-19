#!/usr/bin/env node
/**
 * statshub — one command. Collects local coding-agent activity and uploads it.
 *
 *   npx statshub
 *
 * The first run asks GitHub to confirm who you are (a one-time code), because
 * the server derives your page's slug from the verified account rather than
 * anything the client claims. The token is cached, so later runs just upload.
 */
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { collect, setLogger } from "../lib/collect.mjs";

const CONFIG = path.join(homedir(), ".statshub.json");
const SERVER = (process.env.STATSHUB_SERVER || "https://statshub.vercel.app").replace(/\/$/, "");
const CLIENT_ID = process.env.STATSHUB_CLIENT_ID || "";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const say = (...a) => console.log(...a);
const die = (m) => { console.error(c.red("error: ") + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (has("--help") || has("-h")) {
  say(`
${c.bold("statshub")} — publish your coding-agent activity

  ${c.bold("npx statshub")} [options]

  --private        also count private commits and PRs (asks for the broader
                   \`repo\` scope; public-only otherwise)
  --dry-run        collect and print, upload nothing
  --out FILE       also write the snapshot to a file
  --skip-cursor    skip Cursor's multi-GB scan
  --server URL     override the destination

${c.dim(`server: ${SERVER}`)}
`);
  process.exit(0);
}

/* ---------- auth (inline, first run only) ---------- */

const readToken = () => { try { return JSON.parse(readFileSync(CONFIG, "utf8")); } catch { return {}; } };
const clearToken = () => { try { rmSync(CONFIG); } catch {} };
function saveToken(v) {
  writeFileSync(CONFIG, JSON.stringify(v, null, 2));
  chmodSync(CONFIG, 0o600); // it is a credential
}

async function authenticate(scope) {
  if (!CLIENT_ID) die("STATSHUB_CLIENT_ID is not set (see README > Setup).");

  const start = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope }),
  }).then((r) => r.json());
  if (start.error) die(start.error_description || start.error);

  say("");
  say(`  ${c.bold("Code:")} ${c.cyan(start.user_code)}   ${c.dim("→")} ${start.verification_uri}`);
  process.stdout.write(c.dim("  waiting… "));

  const deadline = Date.now() + (start.expires_in ?? 900) * 1000;
  let interval = (start.interval ?? 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    const r = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID, device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    }).then((x) => x.json());

    if (r.access_token) {
      say(c.green("ok"));
      saveToken({ token: r.access_token, scope });
      return r.access_token;
    }
    if (r.error === "authorization_pending") continue;
    if (r.error === "slow_down") { interval += (r.interval ?? 5) * 1000; continue; }
    say(""); die(r.error_description || r.error);
  }
  say(""); die("timed out waiting for approval");
}

/* ---------- upload ---------- */

async function upload(server, token, snapshot) {
  const res = await fetch(`${server}/api/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/* ---------- run ---------- */

const wantPrivate = has("--private");
const scope = wantPrivate ? "read:user repo" : "read:user";
const server = (val("--server") || SERVER).replace(/\/$/, "");

let saved = readToken();
// A saved public-only token can't count private work, so widen it on request.
if (saved.token && wantPrivate && !String(saved.scope || "").includes("repo")) saved = {};
let token = saved.token || process.env.GITHUB_TOKEN;

if (!token) {
  if (wantPrivate) {
    say(c.dim("\n  --private asks for the `repo` scope so private commits and PRs are"));
    say(c.dim("  counted. That grants read/write to your repositories, and the token is"));
    say(c.dim("  sent to the server once to prove who you are. It is never stored there."));
  }
  token = await authenticate(scope);
}

setLogger((...a) => say(c.dim("  " + a.join(" "))));
say(c.bold("\nstatshub"), c.dim("— collecting\n"));

const snapshot = await collect({ token, skipCursor: has("--skip-cursor") || !!process.env.SKIP_CURSOR });
const h = snapshot.headline;

say("");
say(`  ${c.bold(h.tokens.toLocaleString())} tokens   ${c.dim(`+${h.cachedTokens.toLocaleString()} cached`)}`);
say(`  ${c.bold(h.prompts.toLocaleString())} prompts  ${c.dim(`${h.promptsPerPromptDay}/day over ${h.promptDays} days`)}`);
say(`  ${c.bold(h.commits.toLocaleString())} commits  ${c.bold(h.prs.toLocaleString())} PRs`);
say("");

const outFile = val("--out");
if (outFile) { writeFileSync(outFile, JSON.stringify(snapshot, null, 2)); say(`  wrote ${outFile}`); }
if (has("--dry-run")) { say(c.dim("  --dry-run: nothing uploaded\n")); process.exit(0); }

let res = await upload(server, token, snapshot);

// A cached token can be revoked or expire. Re-authenticate once rather than
// making the user run some separate logout command.
if (res.status === 401 && saved.token) {
  say(c.dim("  saved sign-in is no longer valid — asking GitHub again"));
  clearToken();
  token = await authenticate(scope);
  res = await upload(server, token, snapshot);
}

if (!res.ok) die(`upload failed (${res.status}): ${res.body.error || "unknown"}`);
say(`  ${c.green("published")} → ${server}/${res.body.slug}\n`);
