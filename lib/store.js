/**
 * Snapshot storage — Postgres (Neon).
 *
 * Queries are one-shot and tiny, so a lazily-created pool is plenty. On Vercel
 * use Neon's *pooled* connection string (the host containing `-pooler`), so
 * serverless invocations don't exhaust the database's connection limit.
 */
import pg from "pg";

let pool;
let schemaReady;

export const configured = () => Boolean(process.env.DATABASE_URL);

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon requires TLS; a local postgres generally has none.
    ssl: /neon\.tech|sslmode=require/.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false } : false,
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

const SCHEMA = `
  create table if not exists snapshots (
    slug         text primary key,
    github_id    bigint not null,
    data         jsonb not null,
    published_at timestamptz not null default now()
  );
  create index if not exists snapshots_tokens_idx
    on snapshots ((( data -> 'headline' ->> 'tokens' )::bigint) desc);
`;

/** Idempotent, and memoised so it costs one round trip per process. */
export async function ensureSchema() {
  schemaReady ??= getPool().query(SCHEMA);
  await schemaReady;
}

/** GitHub logins: alphanumeric and single hyphens, 1-39 chars. */
export function normalizeSlug(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(s) ? s : null;
}

export async function getUser(slug) {
  const s = normalizeSlug(slug);
  if (!s || !configured()) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `select data, published_at from snapshots where slug = $1`, [s]
  );
  if (!rows.length) return null;
  return { ...rows[0].data, slug: s, publishedAt: rows[0].published_at.toISOString() };
}

export async function listUsers() {
  if (!configured()) return [];
  await ensureSchema();
  const { rows } = await getPool().query(
    `select slug, data, published_at from snapshots
      order by (( data -> 'headline' ->> 'tokens' )::bigint) desc nulls last`
  );
  return rows.map((r) => ({ ...r.data, slug: r.slug, publishedAt: r.published_at.toISOString() }));
}

/** When this account last published, or null. Used for rate limiting. */
export async function lastPublishedAt(slug) {
  const s = normalizeSlug(slug);
  if (!s || !configured()) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `select published_at from snapshots where slug = $1`, [s]
  );
  return rows.length ? rows[0].published_at : null;
}

export async function putUser(slug, githubId, snapshot) {
  const s = normalizeSlug(slug);
  if (!s) throw new Error(`invalid slug: ${slug}`);
  await ensureSchema();
  await getPool().query(
    `insert into snapshots (slug, github_id, data, published_at)
          values ($1, $2, $3, now())
     on conflict (slug) do update
            set data = excluded.data,
                github_id = excluded.github_id,
                published_at = now()`,
    [s, githubId, JSON.stringify(snapshot)]
  );
}
