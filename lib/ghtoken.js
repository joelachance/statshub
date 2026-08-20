/**
 * Keeps a usable GitHub token on hand.
 *
 * GitHub Apps (client ids beginning `Iv`) issue user tokens that expire after
 * eight hours when token expiration is enabled, and hand back a refresh token.
 * Classic OAuth App tokens never expire and have neither. This handles both:
 * with no expiry recorded, the stored token is returned untouched.
 */
import { updateToken } from "@/lib/store";

const SKEW_MS = 5 * 60 * 1000; // refresh a little early rather than racing expiry

export async function freshToken(user) {
  if (!user?.gh_token) return null;
  const exp = user.gh_expires_at ? new Date(user.gh_expires_at).getTime() : null;
  if (!exp || exp - SKEW_MS > Date.now()) return user.gh_token;
  if (!user.gh_refresh_token) return null; // expired with no way to renew

  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.gh_refresh_token,
    }),
  }).then((x) => x.json()).catch(() => ({}));

  if (!r.access_token) return null;
  const next = {
    token: r.access_token,
    refreshToken: r.refresh_token || user.gh_refresh_token,
    expiresAt: r.expires_in ? new Date(Date.now() + r.expires_in * 1000) : null,
  };
  await updateToken(user.slug, next);
  return next.token;
}

/** Normalise a token-exchange response into what upsertUser expects. */
export function tokenFields(res) {
  return {
    token: res.access_token,
    scope: res.scope || "",
    refreshToken: res.refresh_token || null,
    expiresAt: res.expires_in ? new Date(Date.now() + res.expires_in * 1000) : null,
  };
}
