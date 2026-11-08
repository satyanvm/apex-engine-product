import "server-only";
import { query } from "./db";
import { HttpError } from "./api";

export type QuotaKind = "compiles" | "runs";

export function monthOf(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function envLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return process.env[name] && Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export interface Usage {
  compiles: number;
  runs: number;
  compileLimit: number;
  runLimit: number;
  month: string;
}

export async function getUsage(workspaceId: string, at: Date = new Date()): Promise<Usage> {
  const month = monthOf(at);
  const { rows } = await query<{
    compiles: number | null;
    runs: number | null;
    compile_limit: number | null;
    run_limit: number | null;
  }>(
    `SELECT u.compiles, u.runs, w.compile_limit, w.run_limit
       FROM workspaces w
       LEFT JOIN usage u ON u.workspace_id = w.id AND u.month = $2
      WHERE w.id = $1`,
    [workspaceId, month],
  );
  const r = rows[0];
  return {
    compiles: r?.compiles ?? 0,
    runs: r?.runs ?? 0,
    compileLimit: r?.compile_limit ?? envLimit("MONTHLY_COMPILE_LIMIT", 100),
    runLimit: r?.run_limit ?? envLimit("MONTHLY_RUN_LIMIT", 500),
    month,
  };
}

/** Takes one unit of quota atomically, or throws 429 when the month's cap is reached. */
export async function consumeQuota(
  workspaceId: string,
  kind: QuotaKind,
  at: Date = new Date(),
): Promise<void> {
  const usage = await getUsage(workspaceId, at);
  const limit = kind === "compiles" ? usage.compileLimit : usage.runLimit;
  const noun = kind === "compiles" ? "compile" : "run";
  const exceeded = new HttpError(
    429,
    "quota_exceeded",
    `This workspace has used all ${limit} ${noun}s for the month.`,
    { limit },
  );
  if (limit <= 0) throw exceeded;
  // `kind` is one of two literals, never user input.
  const { rowCount } = await query(
    `INSERT INTO usage (workspace_id, month, ${kind}) VALUES ($1, $2, 1)
     ON CONFLICT (workspace_id, month) DO UPDATE SET ${kind} = usage.${kind} + 1
     WHERE usage.${kind} < $3`,
    [workspaceId, monthOf(at), limit],
  );
  if (rowCount === 0) throw exceeded;
}

/** Gives back a unit when the work never started. */
export async function refundQuota(
  workspaceId: string,
  kind: QuotaKind,
  at: Date = new Date(),
): Promise<void> {
  await query(
    `UPDATE usage SET ${kind} = GREATEST(${kind} - 1, 0) WHERE workspace_id = $1 AND month = $2`,
    [workspaceId, monthOf(at)],
  );
}

/** Counts runs the engine already started on a schedule. Not capped: they happened. */
export async function addScheduledRuns(workspaceId: string, count: number, at: Date = new Date()): Promise<void> {
  if (count <= 0) return;
  await query(
    `INSERT INTO usage (workspace_id, month, runs) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, month) DO UPDATE SET runs = usage.runs + $3`,
    [workspaceId, monthOf(at), count],
  );
}
