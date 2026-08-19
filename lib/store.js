/**
 * Snapshot storage.
 *
 * Two backends behind one interface so the app runs identically whether or not
 * hosted storage is configured:
 *
 *   files  — data/users/<login>.json. The default. Works offline, and the
 *            committed JSON doubles as an audit trail.
 *   blob   — Vercel Blob, used automatically when BLOB_READ_WRITE_TOKEN is set.
 *            Deterministic pathnames (addRandomSuffix:false) mean a snapshot's
 *            public URL is derivable, so reads are plain CDN-cached fetches.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "users");
const PREFIX = "users/";
export const usingBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const backend = () => (usingBlob() ? "blob" : "files");

/** Slugs are GitHub logins: alphanumeric and hyphens, 1-39 chars. */
export function normalizeSlug(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(s) ? s : null;
}

/* ---------- files ---------- */

function fileList() {
  try {
    return readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")));
  } catch { return []; }
}

function fileGet(slug) {
  try { return JSON.parse(readFileSync(path.join(DIR, `${slug}.json`), "utf8")); }
  catch { return null; }
}

function filePut(slug, snapshot) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, `${slug}.json`), JSON.stringify(snapshot, null, 2));
}

/* ---------- blob ---------- */

async function blobMod() {
  // Imported lazily so the package stays optional for file-mode deployments.
  return import("@vercel/blob");
}

async function blobPut(slug, snapshot) {
  const { put } = await blobMod();
  await put(`${PREFIX}${slug}.json`, JSON.stringify(snapshot), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,   // deterministic URL, so reads need no lookup
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}

async function blobGet(slug) {
  const { head } = await blobMod();
  try {
    const meta = await head(`${PREFIX}${slug}.json`);
    const res = await fetch(meta.url, { next: { revalidate: 60 } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function blobList() {
  const { list } = await blobMod();
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const out = await Promise.all(
    blobs.map(async (b) => {
      try {
        const r = await fetch(b.url, { next: { revalidate: 60 } });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    })
  );
  return out.filter(Boolean);
}

/* ---------- public interface ---------- */

export async function getUser(slug) {
  const s = normalizeSlug(slug);
  if (!s) return null;
  return usingBlob() ? blobGet(s) : fileGet(s);
}

export async function putUser(slug, snapshot) {
  const s = normalizeSlug(slug);
  if (!s) throw new Error(`invalid slug: ${slug}`);
  return usingBlob() ? blobPut(s, snapshot) : filePut(s, snapshot);
}

export async function listUsers() {
  const all = usingBlob() ? await blobList() : fileList();
  return all.sort((a, b) => (b.headline?.tokens || 0) - (a.headline?.tokens || 0));
}
