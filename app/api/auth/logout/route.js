import { clearSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  await clearSession();
  return Response.redirect(new URL("/", new URL(req.url).origin), 302);
}
