import { revalidatePath } from "next/cache";
import { getUser, putUser, normalizeSlug } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;   // snapshots run ~80 KB; this is generous
const MIN_INTERVAL_MS = 60 * 1000;   // one publish per account per minute

const bad = (status, error) => Response.json({ error }, { status });

/** Keep only the fields the dashboard renders. Anything else a client sends is
 *  discarded rather than trusted — including the slug, which is set from the
 *  authenticated GitHub identity below. */
function sanitize(body) {
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const str = (v, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");

  if (!body || typeof body !== "object") return null;
  if (!Array.isArray(body.calendar) || !body.headline) return null;
  if (body.calendar.length > 400) return null;

  return {
    generatedAt: str(body.generatedAt, 40) || new Date().toISOString(),
    windowDays: num(body.windowDays),
    windowStart: str(body.windowStart, 10),
    windowEnd: str(body.windowEnd, 10),
    // profile is not taken from the body at all — see POST, where it is built
    // from the verified GitHub account.
    profile: { name: "", login: "", avatar: "", bio: "" },
    headline: Object.fromEntries(
      Object.entries(body.headline).map(([k, v]) => [
        k, typeof v === "object" && v ? { date: str(v.date, 10), prompts: num(v.prompts) } : num(v),
      ])
    ),
    tools: (Array.isArray(body.tools) ? body.tools : []).slice(0, 8).map((t) => ({
      slug: str(t.slug, 20), label: str(t.label, 40),
      prompts: num(t.prompts), tokens: num(t.tokens), cached: num(t.cached),
      sessions: num(t.sessions), linesAccepted: num(t.linesAccepted),
      tokensUnavailable: !!t.tokensUnavailable,
    })),
    calendar: body.calendar.slice(0, 400).map((d) => ({
      date: str(d.date, 10),
      prompts: num(d.prompts), tokens: num(d.tokens),
      contributions: num(d.contributions), score: num(d.score),
    })),
    repos: (Array.isArray(body.repos) ? body.repos : []).slice(0, 10).map((r) => ({
      name: r.private ? "Private repository" : str(r.name, 120),
      private: !!r.private,
      commits: num(r.commits),
      stars: r.private ? 0 : num(r.stars),
      language: r.private ? null : str(r.language, 40) || null,
    })),
  };
}

export async function POST(req) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return bad(401, "missing bearer token");

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return bad(413, "snapshot too large");

  // Identity comes from GitHub, never from the request body. The token is used
  // once to resolve the account and is never stored.
  let me;
  try {
    const r = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "statshub", Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!r.ok) return bad(401, "GitHub rejected the token");
    me = await r.json();
  } catch { return bad(502, "could not reach GitHub"); }

  const slug = normalizeSlug(me?.login);
  if (!slug) return bad(400, "token has no usable GitHub login");

  let body;
  try { body = await req.json(); } catch { return bad(400, "invalid JSON"); }

  const clean = sanitize(body);
  if (!clean) return bad(422, "snapshot failed validation");

  const existing = await getUser(slug);
  if (existing?.publishedAt && Date.now() - Date.parse(existing.publishedAt) < MIN_INTERVAL_MS) {
    return bad(429, "already published in the last minute");
  }

  clean.slug = slug;
  // Every displayed identity field comes from the authenticated account, so a
  // client cannot publish under its own slug while showing someone else's name.
  clean.profile = {
    name: String(me.name || me.login).slice(0, 100),
    login: me.login,
    avatar: String(me.avatar_url || "").startsWith("https://avatars.githubusercontent.com/") ? me.avatar_url : "",
    bio: String(me.bio || "").slice(0, 300),
  };
  clean.githubId = me.id;
  clean.publishedAt = new Date().toISOString();

  try { await putUser(slug, clean); } catch (e) { return bad(500, `store failed: ${e.message}`); }

  revalidatePath(`/${slug}`);
  revalidatePath("/");
  return Response.json({ ok: true, slug });
}
