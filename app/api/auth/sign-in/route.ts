import { NextResponse } from "next/server";
import { HttpError, clientIp, readJson, route, str } from "@/lib/api";
import {
  SESSION_COOKIE,
  authenticate,
  clearRateLimit,
  createSession,
  normalizeEmail,
  sessionCookieOptions,
  withinRateLimit,
} from "@/lib/auth";

const WINDOW_SECONDS = 15 * 60;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

export const POST = route(async (req) => {
  const body = await readJson(req);
  const email = str(body, "email");
  const password = str(body, "password").slice(0, 256);
  const emailKey = `signin:email:${normalizeEmail(email)}`;
  const [ipOk, emailOk] = await Promise.all([
    withinRateLimit(`signin:ip:${clientIp(req)}`, MAX_PER_IP, WINDOW_SECONDS),
    withinRateLimit(emailKey, MAX_PER_EMAIL, WINDOW_SECONDS),
  ]);
  if (!ipOk || !emailOk) {
    throw new HttpError(429, "rate_limited", "Too many sign-in attempts. Wait 15 minutes and try again.");
  }
  const user = await authenticate(email, password);
  if (!user) throw new HttpError(401, "invalid_credentials", "Wrong email or password");
  await clearRateLimit(emailKey);
  const token = await createSession(user.userId, user.workspaceId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
