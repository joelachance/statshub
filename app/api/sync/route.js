import { revalidatePath } from "next/cache";
import { userForKey, putAgents, lastAgentsAt, configured } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;   // payloads run ~100 KB; this is generous
const MIN_INTERVAL_MS = 60 * 1000;   // one upload per account per minute

const bad = (status, error) => Response.json({ error }, { status });

/** Keep only what the dashboard renders; discard anything else a client sends. */
function sanitize(body) {
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const str = (v, n = 60) => (typeof v === "string" ? v.slice(0, n) : "");
  const dayMap = (o, cap = 400) =>
    Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {})
      .slice(0, cap).map(([k, v]) => [str(k, 10), typeof v === "object" && v
        ? { prompts: num(v.prompts), tokens: num(v.tokens), cached: num(v.cached) }
        : num(v)]));

  if (!body || typeof body !== "object" || !Array.isArray(body.tools)) return null;

  return {
    collectedAt: str(body.collectedAt, 40) || new Date().toISOString(),
    windowDays: num(body.windowDays),
    tools: body.tools.slice(0, 8).map((t) => ({
      slug: str(t.slug, 20), label: str(t.label, 40),
      prompts: num(t.prompts), tokens: num(t.tokens), cached: num(t.cached),
      input: num(t.input), output: num(t.output),
      sessions: num(t.sessions), projects: num(t.projects), linesAccepted: num(t.linesAccepted),
      tokensUnavailable: !!t.tokensUnavailable, skipped: !!t.skipped,
      models: Array.isArray(t.models)
        ? t.models.slice(0, 12).map((m) => ({ name: str(m.name, 60), output: num(m.output) }))
        : undefined,
    })),
    days: dayMap(body.days),
    byTool: Object.fromEntries(Object.entries(body.byTool && typeof body.byTool === "object" ? body.byTool : {})
      .slice(0, 8).map(([k, v]) => [str(k, 20), dayMap(v)])),
  };
}

export async function POST(req) {
  if (!configured()) return bad(503, "server has no database configured");

  const key = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!key) return bad(401, "missing push key");

  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) return bad(413, "payload too large");

  // The key alone decides whose profile this lands on. Nothing in the body can
  // change that, so a stolen payload cannot be published under another account.
  const user = await userForKey(key);
  if (!user) return bad(401, "unrecognised push key");

  let body;
  try { body = await req.json(); } catch { return bad(400, "invalid JSON"); }

  const clean = sanitize(body);
  if (!clean) return bad(422, "payload failed validation");

  const last = await lastAgentsAt(user.slug);
  if (last && Date.now() - last.getTime() < MIN_INTERVAL_MS) {
    return bad(429, "already uploaded in the last minute");
  }

  try { await putAgents(user.slug, clean); } catch (e) { return bad(500, `store failed: ${e.message}`); }

  revalidatePath(`/${user.slug}`);
  return Response.json({ ok: true, slug: user.slug });
}
