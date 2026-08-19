import { getUserBySlug, putGitHub } from "@/lib/store";
import { getSession } from "@/lib/session";
import { collectGitHub, githubToJSON } from "@/lib/github.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-collect the GitHub half using the token stored at sign-in. */
export async function POST(req) {
  const slug = await getSession();
  if (!slug) return Response.json({ error: "not signed in" }, { status: 401 });

  const user = await getUserBySlug(slug);
  if (!user?.gh_token) return Response.json({ error: "sign in again to refresh" }, { status: 400 });

  try {
    const gh = await collectGitHub(user.gh_token);
    await putGitHub(slug, githubToJSON(gh));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
  return Response.redirect(new URL(`/${slug}`, new URL(req.url).origin), 302);
}
