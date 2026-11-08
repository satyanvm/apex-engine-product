import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query, transaction } from "./db";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAXMEM = 128 * N * R * 2;

export const SESSION_COOKIE = "apex_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const expected = Buffer.from(parts[5], "base64");
  const key = await scrypt(password, Buffer.from(parts[4], "base64"), expected.length, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  });
  return timingSafeEqual(key, expected);
}

// Verified when the email is unknown, so both failures take the same time.
let decoyHash: Promise<string> | undefined;
function decoy(): Promise<string> {
  decoyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return decoyHash;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionInfo {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(
  email: string,
  name: string,
  password: string,
): Promise<{ userId: string; workspaceId: string } | null> {
  const passwordHash = await hashPassword(password);
  const display = name.trim() || normalizeEmail(email).split("@")[0];
  return transaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [normalizeEmail(email), display, passwordHash],
    );
    if (user.rowCount === 0) return null;
    const workspace = await client.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      [`${display}'s workspace`],
    );
    await client.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')", [
      user.rows[0].id,
      workspace.rows[0].id,
    ]);
    return { userId: user.rows[0].id, workspaceId: workspace.rows[0].id };
  });
}

export async function authenticate(
  email: string,
  password: string,
): Promise<{ userId: string; workspaceId: string } | null> {
  const { rows } = await query<{ id: string; password_hash: string; workspace_id: string }>(
    `SELECT u.id, u.password_hash, m.workspace_id
       FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE u.email = $1 ORDER BY m.created_at LIMIT 1`,
    [normalizeEmail(email)],
  );
  if (rows.length === 0) {
    await verifyPassword(password, await decoy());
    return null;
  }
  if (!(await verifyPassword(password, rows[0].password_hash))) return null;
  return { userId: rows[0].id, workspaceId: rows[0].workspace_id };
}

export async function createSession(userId: string, workspaceId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await query("DELETE FROM sessions WHERE expires_at < now()");
  await query("INSERT INTO sessions (token_hash, user_id, workspace_id, expires_at) VALUES ($1, $2, $3, $4)", [
    hashToken(token),
    userId,
    workspaceId,
    new Date(Date.now() + SESSION_TTL_MS),
  ]);
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function sessionFromToken(token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null;
  const { rows } = await query<{
    user_id: string;
    email: string;
    name: string;
    workspace_id: string;
    workspace_name: string;
  }>(
    `SELECT s.user_id, u.email, u.name, s.workspace_id, w.name AS workspace_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.user_id = s.user_id AND m.workspace_id = s.workspace_id
       JOIN workspaces w ON w.id = s.workspace_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    userId: r.user_id,
    email: r.email,
    name: r.name,
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
  };
}

/**
 * Fixed-window counter, stored in Postgres so it holds across instances.
 * Returns true while the caller is within `max` hits per `windowSeconds`.
 */
export async function withinRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { rows } = await query<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2)
                    THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2)
                           THEN now() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowSeconds],
  );
  return rows[0].count <= max;
}

export async function clearRateLimit(key: string): Promise<void> {
  await query("DELETE FROM rate_limits WHERE key = $1", [key]);
}

export function sessionCookieOptions() {
  const appUrl = process.env.APP_URL ?? "";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && !appUrl.startsWith("http://"),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}
