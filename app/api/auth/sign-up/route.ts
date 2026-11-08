import { NextResponse } from "next/server";
import { HttpError, badRequest, clientIp, readJson, route, str } from "@/lib/api";
import { SESSION_COOKIE, createSession, createUser, sessionCookieOptions, withinRateLimit } from "@/lib/auth";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = route(async (req) => {
  const body = await readJson(req);
  const email = str(body, "email");
  const password = str(body, "password");
  if (!EMAIL.test(email.trim()) || email.length > 254) throw badRequest("Enter a valid email address");
  if (password.length < 10) throw badRequest("Use a password of at least 10 characters");
  if (password.length > 256) throw badRequest("That password is too long");
  if (!(await withinRateLimit(`signup:ip:${clientIp(req)}`, 10, 3600))) {
    throw new HttpError(429, "rate_limited", "Too many sign-ups from this address. Try again later.");
  }
  const created = await createUser(email, str(body, "name").slice(0, 80), password);
  if (!created) throw new HttpError(409, "email_taken", "An account with that email already exists");
  const token = await createSession(created.userId, created.workspaceId);
  const res = NextResponse.json({ ok: true }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
