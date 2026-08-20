/**
 * The origin a browser actually used to reach us.
 *
 * Behind a tunnel or proxy (ngrok, Vercel) the request URL carries the internal
 * host, so building an OAuth redirect_uri from it sends GitHub to localhost.
 * Prefer an explicitly configured public origin, then the forwarded headers,
 * and only fall back to the request itself when running directly.
 */
export function publicOrigin(req) {
  const configured = process.env.STATSHUB_SERVER || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")
      || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}
