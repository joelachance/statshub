/**
 * GitHub App vs OAuth App.
 *
 * A GitHub App client id begins with `Iv`; a classic OAuth App uses 20 hex
 * characters. The distinction matters because only a GitHub App has to be
 * *installed* on an account before it can see that account's private
 * repositories — authorising it is not enough.
 */
export const isGitHubApp = () => /^Iv/.test(process.env.GITHUB_CLIENT_ID || "");
export const appSlug = () => process.env.GITHUB_APP_SLUG || "";

/**
 * Where to send someone to install. With "Request user authorization during
 * installation" enabled this also issues the user token, so one trip through
 * it both installs and signs in.
 */
export function installUrl(state) {
  const slug = appSlug();
  if (!slug) return null;
  const u = new URL(`https://github.com/apps/${slug}/installations/new`);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

/** How many accounts the token can see the app installed on. */
export async function countInstallations(token) {
  try {
    const r = await fetch("https://api.github.com/user/installations", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "statshub" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.total_count === "number" ? j.total_count : null;
  } catch { return null; }
}
