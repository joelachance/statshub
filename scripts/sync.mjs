#!/usr/bin/env node
/**
 * Local sync — collects a snapshot and writes it to data/users/<login>.json.
 *
 * This is the file-mode path used by the repo owner and the launchd job. The
 * published CLI (bin/statshub.mjs) shares the same collector but publishes to
 * a server instead.
 */
import { execFileSync } from "node:child_process";
import { collect, setLogger } from "../lib/collect.mjs";
import { putUser } from "../lib/store.js";

function localToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim(); }
  catch { return null; }
}

setLogger((...a) => console.log(...a));
console.log("statshub — collecting\n");

const token = localToken();
if (!token) console.log("  github: no token (set GITHUB_TOKEN or run `gh auth login`) — skipping\n");

const snapshot = await collect({ token, skipCursor: !!process.env.SKIP_CURSOR });
const h = snapshot.headline;

await putUser(snapshot.slug, snapshot);

console.log(`\n  window        ${snapshot.windowStart} → ${snapshot.windowEnd} (${snapshot.windowDays}d)`);
console.log(`  tokens        ${h.tokens.toLocaleString()} billed  (+${h.cachedTokens.toLocaleString()} cached reads)`);
console.log(`  prompts       ${h.prompts.toLocaleString()} over ${h.promptDays} prompting days = ${h.promptsPerPromptDay}/day`);
console.log(`  commits       ${h.commits.toLocaleString()}  (public-only counter said ${h.publicCommits.toLocaleString()})`);
console.log(`  PRs           ${h.prs.toLocaleString()} opened, ${h.prsMerged.toLocaleString()} merged`);
console.log(`  streak        ${h.current}d current, ${h.longest}d longest, ${h.activeDays} active days`);
console.log(`\nwrote data/users/${snapshot.slug}.json`);
