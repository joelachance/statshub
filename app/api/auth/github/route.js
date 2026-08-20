import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kick off the OAuth dance. `private=1` asks for the broader repo scope. */
export async function GET(req) {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) return new Response("GITHUB_CLIENT_ID is not set", { status: 503 });

  const url = new URL(req.url);
  const origin = publicOrigin(req);
  // `repo` is the only classic scope that lets commit search see private
  // repositories, so it stays opt-in rather than being requested up front.
  const scope = url.searchParams.get("private") === "1" ? "read:user repo" : "read:user";

  const state = randomBytes(16).toString("hex");
  (await cookies()).set("sh_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 600,
  });

  const to = new URL("https://github.com/login/oauth/authorize");
  to.searchParams.set("client_id", id);
  to.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  to.searchParams.set("scope", scope);
  to.searchParams.set("state", state);
  return Response.redirect(to.toString(), 302);
}
