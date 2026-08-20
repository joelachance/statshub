import { installUrl } from "@/lib/ghapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send the browser to the app's installation page. */
export async function GET() {
  const url = installUrl();
  if (!url) {
    return new Response(
      "GITHUB_APP_SLUG is not set. Find the slug in the app's settings URL " +
      "(github.com/settings/apps/<slug>) and add it to the environment.",
      { status: 503, headers: { "content-type": "text/plain" } }
    );
  }
  return Response.redirect(url, 302);
}
