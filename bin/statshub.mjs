#!/usr/bin/env node
/**
 * statshub — one command. Uploads your local coding-agent activity.
 *
 *   npx statshub sk_your_key      first run, key from your dashboard
 *   npx statshub                  every run after that
 *
 * There is no sign-in here. You sign in with GitHub on the web, which is also
 * where the GitHub half of your profile is collected; this command only reads
 * local agent logs and pushes them.
 */
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { collect, setLogger } from "../lib/collect.mjs";

const CONFIG = path.join(homedir(), ".statshub.json");
const SERVER = (process.env.STATSHUB_SERVER || "https://statshub.vercel.app").replace(/\/$/, "");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`,
};
const say = (...a) => console.log(...a);
const die = (m) => { console.error(c.red("error: ") + m); process.exit(1); };

if (has("--help") || has("-h")) {
  say(`
${c.bold("statshub")} — publish your coding-agent activity

  ${c.bold("npx statshub")} [key] [options]

  Pass the key from your dashboard once; it is remembered after that.
  Sign in at ${SERVER} to get one.

  --dry-run        collect and print, upload nothing
  --out FILE       also write the collected data to a file
  --skip-cursor    skip Cursor's multi-GB scan
  --server URL     override the destination

${c.dim(`config: ${CONFIG}`)}
`);
  process.exit(0);
}

const readCfg = () => { try { return JSON.parse(readFileSync(CONFIG, "utf8")); } catch { return {}; } };
function saveCfg(v) {
  writeFileSync(CONFIG, JSON.stringify(v, null, 2));
  chmodSync(CONFIG, 0o600); // it is a credential
}

const server = (val("--server") || SERVER).replace(/\/$/, "");
const cfg = readCfg();
// A bare sk_… argument is the key; anything else positional is ignored.
const argKey = argv.find((a) => a.startsWith("sk_"));
const key = argKey || process.env.STATSHUB_KEY || cfg.key;

if (!key && !has("--dry-run")) {
  die(`no key. Sign in at ${server} and run:  npx statshub sk_your_key`);
}

setLogger((...a) => say(c.dim("  " + a.join(" "))));
say(c.bold("\nstatshub"), c.dim("— collecting\n"));

const agents = await collect({ skipCursor: has("--skip-cursor") || !!process.env.SKIP_CURSOR });

const tot = (f) => agents.tools.reduce((n, t) => n + (t[f] || 0), 0);
say("");
say(`  ${c.bold(tot("tokens").toLocaleString())} tokens   ${c.dim(`+${tot("cached").toLocaleString()} cached`)}`);
say(`  ${c.bold(tot("prompts").toLocaleString())} prompts  ${c.dim(`${tot("sessions").toLocaleString()} sessions`)}`);
say(c.dim(`  ${agents.tools.filter((t) => t.prompts > 0).map((t) => t.label).join(", ")}`));
say("");

const outFile = val("--out");
if (outFile) { writeFileSync(outFile, JSON.stringify(agents, null, 2)); say(`  wrote ${outFile}`); }
if (has("--dry-run")) { say(c.dim("  --dry-run: nothing uploaded\n")); process.exit(0); }

const res = await fetch(`${server}/api/sync`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify(agents),
});
const body = await res.json().catch(() => ({}));

if (res.status === 401) die(`that key was not accepted. Get a fresh one at ${server}`);
if (!res.ok) die(`upload failed (${res.status}): ${body.error || "unknown"}`);

if (argKey) saveCfg({ ...cfg, key: argKey });   // only remember a key that worked
say(`  ${c.green("published")} → ${server}/${body.slug}\n`);
