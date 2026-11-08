import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { SESSION_COOKIE, destroySession, sessionCookieOptions } from "@/lib/auth";

export const POST = route(async (req) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
});
