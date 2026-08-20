import { clearSession } from "@/lib/session";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  await clearSession();
  return Response.redirect(`${publicOrigin(req)}/`, 302);
}
