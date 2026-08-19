/**
 * Sign-in sessions.
 *
 * A signed cookie holding nothing but the slug and an expiry. There is no
 * session table to keep in sync, and the signature means the value cannot be
 * edited client-side to impersonate another account.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "sh_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const secret = () => process.env.SESSION_SECRET || "";
const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString();

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function verify(payload, mac) {
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(String(mac || ""));
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function setSession(slug) {
  if (!secret()) throw new Error("SESSION_SECRET is not set");
  const payload = b64(JSON.stringify({ slug, exp: Date.now() + MAX_AGE * 1000 }));
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** The signed-in slug, or null. Never throws — an unreadable cookie is a logout. */
export async function getSession() {
  if (!secret()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !verify(payload, mac)) return null;
  try {
    const { slug, exp } = JSON.parse(unb64(payload));
    return exp > Date.now() ? slug : null;
  } catch { return null; }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
