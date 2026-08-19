import { issueKey } from "@/lib/store";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issue (or replace) the caller's push key. The plaintext is shown once. */
export async function POST(req) {
  const slug = await getSession();
  if (!slug) return Response.json({ error: "not signed in" }, { status: 401 });
  const key = await issueKey(slug);
  return Response.redirect(new URL(`/${slug}?key=${encodeURIComponent(key)}`, new URL(req.url).origin), 302);
}
