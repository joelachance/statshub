/**
 * Storage — Postgres (Neon).
 *
 * Two tables. `users` is identity, established by GitHub sign-in on the web.
 * `snapshots` holds the two halves of a profile, written by different actors at
 * different times: `agents` comes from the CLI, `github` is collected here.
 *
 * On Vercel use Neon's *pooled* connection string (the host containing
 * `-pooler`) so serverless invocations don't exhaust the connection limit.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import pg from "pg";

let pool;
let schemaReady;

export const configured = () => Boolean(process.env.DATABASE_URL);

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /neon\.tech|sslmode=require/.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false } : false,
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

const SCHEMA = `
  create table if not exists users (
    slug          text primary key,
    github_id     bigint unique not null,
    name          text,
    avatar        text,
    bio           text,
    gh_token      text,
    gh_scope      text,
    key_hash      text,
    key_prefix    text,
    created_at    timestamptz not null default now()
  );
  create table if not exists snapshots (
    slug        text primary key references users(slug) on delete cascade,
    agents      jsonb,
    github      jsonb,
    agents_at   timestamptz,
    github_at   timestamptz
  );
  create index if not exists snapshots_tokens_idx
    on snapshots ((( agents -> 'tools' )::text));
`;

export async function ensureSchema() {
  schemaReady ??= getPool().query(SCHEMA);
  await schemaReady;
}

/** GitHub logins: alphanumeric and single hyphens, 1-39 chars. */
export function normalizeSlug(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(s) ? s : null;
}

/* ---------- identity ---------- */

export async function upsertUser({ githubId, login, name, avatar, bio, token, scope }) {
  const slug = normalizeSlug(login);
  if (!slug) throw new Error(`invalid login: ${login}`);
  await ensureSchema();
  const { rows } = await getPool().query(
    `insert into users (slug, github_id, name, avatar, bio, gh_token, gh_scope)
          values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (github_id) do update
            set slug = excluded.slug, name = excluded.name, avatar = excluded.avatar,
                bio = excluded.bio, gh_token = excluded.gh_token, gh_scope = excluded.gh_scope
       returning *`,
    [slug, githubId, name || login, avatar || "", bio || "", token || null, scope || null]
  );
  return rows[0];
}

export async function getUserBySlug(slug) {
  const s = normalizeSlug(slug);
  if (!s || !configured()) return null;
  await ensureSchema();
  const { rows } = await getPool().query(`select * from users where slug = $1`, [s]);
  return rows[0] || null;
}

export async function listUserSlugs() {
  if (!configured()) return [];
  await ensureSchema();
  const { rows } = await getPool().query(`select slug from users order by created_at`);
  return rows.map((r) => r.slug);
}

/* ---------- push keys ---------- */

const hashKey = (k) => createHash("sha256").update(k).digest("hex");

/**
 * Issue a push key. Only the hash is stored, so a database leak cannot be
 * replayed as an upload, and the plaintext is returned exactly once.
 */
export async function issueKey(slug) {
  const s = normalizeSlug(slug);
  if (!s) throw new Error("invalid slug");
  const key = `sk_${randomBytes(24).toString("hex")}`;
  await ensureSchema();
  await getPool().query(
    `update users set key_hash = $2, key_prefix = $3 where slug = $1`,
    [s, hashKey(key), key.slice(0, 11)]
  );
  return key;
}

/** Resolve a push key to its owner, in constant time. */
export async function userForKey(key) {
  if (!configured() || typeof key !== "string" || !key.startsWith("sk_")) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `select * from users where key_hash is not null and key_prefix = $1`,
    [key.slice(0, 11)]
  );
  const want = Buffer.from(hashKey(key), "hex");
  for (const r of rows) {
    const got = Buffer.from(r.key_hash, "hex");
    if (got.length === want.length && timingSafeEqual(got, want)) return r;
  }
  return null;
}

/* ---------- snapshot halves ---------- */

export async function putAgents(slug, agents) {
  await ensureSchema();
  await getPool().query(
    `insert into snapshots (slug, agents, agents_at) values ($1, $2, now())
     on conflict (slug) do update set agents = excluded.agents, agents_at = now()`,
    [slug, JSON.stringify(agents)]
  );
}

export async function putGitHub(slug, github) {
  await ensureSchema();
  await getPool().query(
    `insert into snapshots (slug, github, github_at) values ($1, $2, now())
     on conflict (slug) do update set github = excluded.github, github_at = now()`,
    [slug, JSON.stringify(github)]
  );
}

export async function getHalves(slug) {
  const s = normalizeSlug(slug);
  if (!s || !configured()) return { agents: null, github: null };
  await ensureSchema();
  const { rows } = await getPool().query(
    `select agents, github, agents_at from snapshots where slug = $1`, [s]
  );
  return rows.length ? rows[0] : { agents: null, github: null };
}

export async function lastAgentsAt(slug) {
  const s = normalizeSlug(slug);
  if (!s) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `select agents_at from snapshots where slug = $1`, [s]
  );
  return rows[0]?.agents_at || null;
}
