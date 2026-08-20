#!/usr/bin/env node
/**
 * Assemble the publishable CLI package.
 *
 * The repo's package.json belongs to the web app and depends on Next, React
 * and pg. The command needs none of them — only node builtins and the local
 * collector — so publishing the repo directly would make `npx statshub`
 * download the whole application. This stages a minimal package instead.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".cli-package");
const app = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "bin"), { recursive: true });
mkdirSync(path.join(OUT, "lib"), { recursive: true });

// Exactly the two files the command imports at runtime.
cpSync(path.join(ROOT, "bin/statshub.mjs"), path.join(OUT, "bin/statshub.mjs"));
cpSync(path.join(ROOT, "lib/collect.mjs"), path.join(OUT, "lib/collect.mjs"));

writeFileSync(path.join(OUT, "package.json"), JSON.stringify({
  name: "statshub",
  version: app.version,
  description: "Publish your coding-agent activity — Claude Code, Codex, Cursor, opencode and pi — to a single dashboard.",
  bin: { statshub: "bin/statshub.mjs" },
  files: ["bin", "lib", "README.md"],
  type: "module",
  engines: { node: ">=18" },
  keywords: ["claude-code", "codex", "cursor", "opencode", "statistics", "dashboard"],
  license: app.license || "MIT",
  ...(app.repository ? { repository: app.repository } : {}),
}, null, 2) + "\n");

writeFileSync(path.join(OUT, "README.md"), `# statshub

Publish your coding-agent activity to a single dashboard.

\`\`\`
npx statshub sk_your_key      # first run — key from your dashboard
npx statshub                  # every run after that
\`\`\`

Reads local logs from Claude Code, Codex, Cursor, opencode and pi, and uploads
the totals. Nothing but counted totals leaves your machine, and the command
holds no GitHub credential — GitHub sign-in happens on the web.

| Flag | |
| --- | --- |
| \`--dry-run\` | collect and print, upload nothing |
| \`--out FILE\` | also write the collected data to a file |
| \`--skip-cursor\` | skip Cursor's multi-GB scan |
| \`--server URL\` | override the destination |
`);

console.log(`staged ${path.relative(ROOT, OUT)}`);
