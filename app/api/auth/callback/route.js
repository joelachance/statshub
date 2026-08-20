import { cookies } from "next/headers";
import { upsertUser, putGitHub, setInstallations } from "@/lib/store";
import { setSession } from "@/lib/session";
import { collectGitHub, githubToJSON } from "@/lib/github.mjs";
import { publicOrigin } from "@/lib/origin";
import { tokenFields } from "@/lib/ghtoken";
import { countInstallations } from "@/lib/ghapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the contributions query plus five searches

const fail = (origin, why) => Response.redirect(`${origin}/?error=${encodeURIComponent(why)}`, 302);

export async function GET(req) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expected = jar.get("sh_oauth_state")?.value;
  jar.delete("sh_oauth_state");

  // Without this check a third party could hand the user a callback URL and
  // sign them into an account they don't control.
  if (!code || !state || !expected || state !== expected) return fail(origin, "sign-in expired, try again");

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/callback`,
    }),
  }).then((r) => r.json()).catch(() => ({}));

  const token = res.access_token;
  if (!token) return fail(origin, res.error_description || "GitHub declined the sign-in");

  const me = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "statshub" },
    cache: "no-store",
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  if (!me?.login) return fail(origin, "could not read your GitHub account");

  const user = await upsertUser({
    githubId: me.id, login: me.login, name: me.name, avatar: me.avatar_url,
    bio: me.bio, ...tokenFields(res),
  });

  // Knowing this lets the page say plainly why private work is missing.
  const installs = await countInstallations(token);
  if (installs !== null) await setInstallations(user.slug, installs);

  // Collect the GitHub half now so the page has something on it immediately.
  try {
    const gh = await collectGitHub(token);
    await putGitHub(user.slug, githubToJSON(gh));
  } catch {
    // A failed collection is not a failed sign-in; the refresh action retries.
  }

  await setSession(user.slug);
  return Response.redirect(`${origin}/${user.slug}`, 302);
}
