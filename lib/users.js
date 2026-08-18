import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "users");

/** Every synced snapshot on disk. Each file is one person's dashboard. */
export function allUsers() {
  let files = [];
  try { files = readdirSync(DIR).filter((f) => f.endsWith(".json")); } catch { return []; }
  return files
    .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")))
    .sort((a, b) => (b.headline?.tokens || 0) - (a.headline?.tokens || 0));
}

export function getUser(slug) {
  return allUsers().find((u) => u.slug === String(slug).toLowerCase()) || null;
}
