import { getUserBySlug, putGitHub } from "@/lib/store";
import { getSession } from "@/lib/session";
import { publicOrigin } from "@/lib/origin";
import { collectGitHub, githubToJSON } from "@/lib/github.mjs";
import { freshToken } from "@/lib/ghtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-collect the GitHub half using the token stored at sign-in. */
export async function POST(req) {
  const slug = await getSession();
  if (!slug) return Response.json({ error: "not signed in" }, { status: 401 });

  const user = await getUserBySlug(slug);
  const token = await freshToken(user);
  if (!token) return Response.json({ error: "sign in again to refresh" }, { status: 400 });

  try {
    const gh = await collectGitHub(token);
    await putGitHub(slug, githubToJSON(gh));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
  return Response.redirect(`${publicOrigin(req)}/${slug}`, 302);
}
