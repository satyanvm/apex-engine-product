import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionFromToken, type SessionInfo } from "./auth";

export async function currentSession(): Promise<SessionInfo | null> {
  const store = await cookies();
  return sessionFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionInfo> {
  const session = await currentSession();
  if (!session) redirect("/sign-in");
  return session;
}
