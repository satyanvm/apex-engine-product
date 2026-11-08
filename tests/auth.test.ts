import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORIGIN, call, closeDb, resetDb, sessionCookie, setupDb, startFakeEngine, type FakeEngine } from "./helpers";
import { POST as signUp } from "@/app/api/auth/sign-up/route";
import { POST as signIn } from "@/app/api/auth/sign-in/route";
import { POST as signOut } from "@/app/api/auth/sign-out/route";
import { GET as listFlows } from "@/app/api/flows/route";
import { hashPassword, hashToken, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";

let engine: FakeEngine;
beforeAll(async () => {
  await setupDb();
  engine = await startFakeEngine();
});
beforeEach(resetDb);
afterAll(async () => {
  await engine.close();
  await closeDb();
});

const creds = { email: "Ada@Example.com", password: "correct horse battery", name: "Ada" };

describe("passwords", () => {
  it("hashes with a per-password salt and verifies only the right password", async () => {
    const a = await hashPassword("one two three four");
    const b = await hashPassword("one two three four");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword("one two three four", a)).toBe(true);
    expect(await verifyPassword("one two three fivE", a)).toBe(false);
  });
});

describe("sign-up", () => {
  it("creates a user, a workspace and a locked-down session cookie", async () => {
    const res = await call(signUp, { body: creds });
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    const { rows } = await query("SELECT email, password_hash FROM users");
    expect(rows[0].email).toBe("ada@example.com");
    expect(rows[0].password_hash).not.toContain(creds.password);
    const members = await query("SELECT role FROM memberships");
    expect(members.rows).toEqual([{ role: "owner" }]);
  });

  it("stores only the hash of the session token", async () => {
    const res = await call(signUp, { body: creds });
    const token = sessionCookie(res).split("=")[1];
    const { rows } = await query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(rows[0].token_hash).not.toBe(token);
  });

  it("refuses a duplicate email in any case", async () => {
    await call(signUp, { body: creds });
    const res = await call(signUp, { body: { ...creds, email: "ADA@example.com" } });
    expect(res.status).toBe(409);
  });

  it("rejects a short password and a bad email", async () => {
    expect((await call(signUp, { body: { ...creds, password: "short" } })).status).toBe(400);
    expect((await call(signUp, { body: { ...creds, email: "nope" } })).status).toBe(400);
  });

  it("limits sign-ups per address", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await call(signUp, { body: { ...creds, email: `u${i}@x.test` }, ip: "9.9.9.9" })).status;
    }
    expect(last).toBe(429);
  });
});

describe("sign-in", () => {
  beforeEach(async () => {
    await call(signUp, { body: creds });
  });

  it("accepts the right password and gives a working session", async () => {
    const res = await call(signIn, { body: { email: "ada@example.com", password: creds.password } });
    expect(res.status).toBe(200);
    const flows = await call(listFlows, { method: "GET", cookie: sessionCookie(res) });
    expect(flows.status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await call(signIn, { body: { email: creds.email, password: "not the password" } });
    const unknown = await call(signIn, { body: { email: "nobody@x.test", password: "not the password" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("locks an email after repeated failures, even with the right password", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await call(signIn, { body: { email: creds.email, password: "bad bad bad" } })).status).toBe(401);
    }
    const blocked = await call(signIn, { body: { email: creds.email, password: creds.password } });
    expect(blocked.status).toBe(429);
  });

  it("limits attempts per address across many emails", async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await call(signIn, { body: { email: `x${i}@x.test`, password: "bad bad bad" }, ip: "8.8.8.8" })).status;
    }
    expect(last).toBe(429);
  });
});

describe("sessions and origin checks", () => {
  it("rejects no cookie and a forged cookie", async () => {
    expect((await call(listFlows, { method: "GET" })).status).toBe(401);
    expect((await call(listFlows, { method: "GET", cookie: "apex_session=forged" })).status).toBe(401);
  });

  it("revokes the session on sign-out", async () => {
    const cookie = sessionCookie(await call(signUp, { body: creds }));
    expect((await call(signOut, { cookie })).status).toBe(200);
    expect((await call(listFlows, { method: "GET", cookie })).status).toBe(401);
  });

  it("rejects an expired session", async () => {
    const cookie = sessionCookie(await call(signUp, { body: creds }));
    await query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect((await call(listFlows, { method: "GET", cookie })).status).toBe(401);
  });

  it("rejects mutations from another origin or with no origin", async () => {
    const cookie = sessionCookie(await call(signUp, { body: creds }));
    const evil = await call(signOut, { cookie, origin: "https://evil.test" });
    expect(evil.status).toBe(403);
    expect((await call(signOut, { cookie, origin: null })).status).toBe(403);
    expect((await call(signIn, { body: creds, origin: "https://evil.test" })).status).toBe(403);
    expect((await call(listFlows, { method: "GET", cookie })).status).toBe(200);
    expect(ORIGIN).toBe(process.env.APP_URL);
  });
});
