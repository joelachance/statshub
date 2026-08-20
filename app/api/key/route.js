import { issueKey } from "@/lib/store";
import { getSession } from "@/lib/session";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issue (or replace) the caller's push key. The plaintext is shown once. */
export async function POST(req) {
  const slug = await getSession();
  if (!slug) return Response.json({ error: "not signed in" }, { status: 401 });
  const key = await issueKey(slug);
  return Response.redirect(`${publicOrigin(req)}/${slug}?key=${encodeURIComponent(key)}`, 302);
}
