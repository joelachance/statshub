#!/usr/bin/env node
/**
 * statshub CLI — collect local coding-agent activity and publish it.
 *
 * Auth is GitHub's OAuth device flow. The server never accepts a claimed
 * username: it resolves identity from the token itself, so a snapshot can only
 * ever be written to the slug of the account that authorised it.
 */
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { collect, setLogger } from "../lib/collect.mjs";

const CONFIG_DIR = path.join(homedir(), ".statshub");
const CONFIG = path.join(CONFIG_DIR, "config.json");
const DEFAULT_SERVER = process.env.STATSHUB_SERVER || "http://localhost:3000";
// Public by design: device flow needs no client secret.
const CLIENT_ID = process.env.STATSHUB_CLIENT_ID || "";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const say = (...a) => console.log(...a);
const die = (m) => { console.error(c.red("error: ") + m); process.exit(1); };

/* ---------- config ---------- */

function readConfig() {
  try { return JSON.parse(readFileSync(CONFIG, "utf8")); } catch { return {}; }
}
function writeConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  chmodSync(CONFIG, 0o600); // the token is a credential
}

/* ---------- device flow ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deviceLogin(scope) {
  if (!CLIENT_ID) {
    die("no OAuth client id. Set STATSHUB_CLIENT_ID, or see README > Hosted setup.");
  }
  const start = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope }),
  }).then((r) => r.json());

  if (start.error) die(`${start.error}: ${start.error_description || ""}`);

  say("");
  say(`  ${c.bold("One-time code:")}  ${c.cyan(start.user_code)}`);
  say(`  ${c.dim("Open")} ${start.verification_uri} ${c.dim("and enter it.")}`);
  say("");
  process.stdout.write(c.dim("  waiting for approval… "));

  const deadline = Date.now() + (start.expires_in ?? 900) * 1000;
  let interval = (start.interval ?? 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    }).then((r) => r.json());

    if (res.access_token) { say(c.green("approved")); return { token: res.access_token, scope }; }
    if (res.error === "authorization_pending") continue;
    if (res.error === "slow_down") { interval += (res.interval ?? 5) * 1000; continue; }
    say("");
    die(res.error_description || res.error || "device flow failed");
  }
  say("");
  die("timed out waiting for approval");
}

/* ---------- commands ---------- */

async function cmdLogin(args) {
  const wantPrivate = args.includes("--include-private");
  // `repo` is the only classic scope that lets commit search see private
  // repositories. It is broad, so it stays opt-in and is called out plainly.
  const scope = wantPrivate ? "read:user repo" : "read:user";

  if (wantPrivate) {
    say(c.dim("\n  --include-private requests the `repo` scope so private commits and PRs"));
    say(c.dim("  are counted. That grants read/write access to your repositories, and the"));
    say(c.dim("  token is sent to the server to prove who you are. Without it, only public"));
    say(c.dim("  activity is counted and the token stays minimal (read:user).\n"));
  }

  const { token } = await deviceLogin(scope);
  const me = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "statshub" },
  }).then((r) => r.json());
  if (!me.login) die("token did not resolve to a GitHub user");

  writeConfig({ ...readConfig(), token, scope, login: me.login });
  say(`  signed in as ${c.bold("@" + me.login)}  ${c.dim(`(scope: ${scope})`)}`);
  say(c.dim(`  token stored at ${CONFIG} (0600)\n`));
}

function cmdLogout() {
  try { rmSync(CONFIG); say("signed out"); } catch { say("not signed in"); }
}

async function cmdWhoami() {
  const { login, scope } = readConfig();
  if (!login) return say("not signed in — run: statshub login");
  say(`@${login}  ${c.dim(`(scope: ${scope || "unknown"})`)}`);
}

async function cmdSync(args) {
  const cfg = readConfig();
  const token = cfg.token || process.env.GITHUB_TOKEN;
  if (!token) die("not signed in — run: statshub login");

  const dryRun = args.includes("--dry-run");
  const skipCursor = args.includes("--skip-cursor") || !!process.env.SKIP_CURSOR;
  const outIdx = args.indexOf("--out");
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
  const srvIdx = args.indexOf("--server");
  const server = (srvIdx >= 0 ? args[srvIdx + 1] : DEFAULT_SERVER).replace(/\/$/, "");

  setLogger((...a) => say(c.dim("  " + a.join(" "))));
  say(c.bold("\nstatshub"), c.dim("— collecting\n"));

  const snapshot = await collect({ token, skipCursor });
  const h = snapshot.headline;

  say("");
  say(`  ${c.bold(h.tokens.toLocaleString())} tokens   ${c.dim(`+${h.cachedTokens.toLocaleString()} cached`)}`);
  say(`  ${c.bold(h.prompts.toLocaleString())} prompts  ${c.dim(`${h.promptsPerPromptDay}/day over ${h.promptDays} days`)}`);
  say(`  ${c.bold(h.commits.toLocaleString())} commits  ${c.bold(h.prs.toLocaleString())} PRs`);
  say("");

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
    say(`  wrote ${outFile}`);
  }
  if (dryRun) { say(c.dim("  --dry-run: nothing published\n")); return; }

  const res = await fetch(`${server}/api/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`publish failed (${res.status}): ${body.error || "unknown"}`);

  say(`  ${c.green("published")} → ${server}/${body.slug}\n`);
}

function cmdHelp() {
  say(`
${c.bold("statshub")} — aggregate your coding-agent activity

  ${c.bold("statshub login")} [--include-private]   authenticate with GitHub
  ${c.bold("statshub sync")}  [--server URL]        collect and publish
                  [--dry-run] [--out FILE] [--skip-cursor]
  ${c.bold("statshub whoami")}                      show the signed-in account
  ${c.bold("statshub logout")}                      remove the stored token

${c.dim("Environment: STATSHUB_SERVER, STATSHUB_CLIENT_ID")}
`);
}

const [cmd, ...args] = process.argv.slice(2);
const run = {
  login: () => cmdLogin(args),
  logout: cmdLogout,
  whoami: cmdWhoami,
  sync: () => cmdSync(args),
  help: cmdHelp,
  undefined: cmdHelp,
}[cmd];

if (!run) die(`unknown command: ${cmd}`);
await run();
