import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "./db";
import { HttpError, badRequest, isUuid, notFound } from "./api";
import { getEngine } from "./engine-server";
import { addScheduledRuns, consumeQuota, getUsage, refundQuota } from "./quota";
import {
  EngineError,
  type Catalog,
  type CompileResult,
  type CreateCatalogRequest,
  type Dag,
  type Plan,
  type Run,
  type RunStatus,
  type Trace,
} from "./engine";

/* ------------------------------- tools ------------------------------- */

export interface Tool {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  nodeCount: number;
  credentialHeaders: string[];
  createdAt: string;
  engineCatalogId: string;
}

type ToolRow = {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  node_count: number;
  credential_headers: string[];
  created_at: Date;
  engine_catalog_id: string;
};

const toTool = (r: ToolRow): Tool => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  baseUrl: r.base_url,
  nodeCount: r.node_count,
  credentialHeaders: r.credential_headers,
  createdAt: r.created_at.toISOString(),
  engineCatalogId: r.engine_catalog_id,
});

export async function listTools(workspaceId: string): Promise<Tool[]> {
  const { rows } = await query<ToolRow>("SELECT * FROM tools WHERE workspace_id = $1 ORDER BY created_at DESC", [
    workspaceId,
  ]);
  return rows.map(toTool);
}

export async function getTool(workspaceId: string, id: string): Promise<Tool> {
  if (!isUuid(id)) throw notFound("Tool not found");
  const { rows } = await query<ToolRow>("SELECT * FROM tools WHERE id = $1 AND workspace_id = $2", [id, workspaceId]);
  if (rows.length === 0) throw notFound("Tool not found");
  return toTool(rows[0]);
}

export async function createTool(
  workspaceId: string,
  req: CreateCatalogRequest,
  credentialHeaders?: Record<string, string>,
): Promise<Tool> {
  const engine = getEngine();
  let catalog: Catalog = await engine.createCatalog(req);
  try {
    if (credentialHeaders && Object.keys(credentialHeaders).length > 0) {
      catalog = await engine.setCatalogCredentials(catalog.id, credentialHeaders);
    }
    const { rows } = await query<ToolRow>(
      `INSERT INTO tools (workspace_id, engine_catalog_id, name, kind, base_url, node_count, credential_headers)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        workspaceId,
        catalog.id,
        catalog.name,
        catalog.kind,
        catalog.baseUrl ?? "",
        catalog.nodeCount,
        catalog.credentialHeaders ?? [],
      ],
    );
    return toTool(rows[0]);
  } catch (err) {
    await engine.deleteCatalog(catalog.id).catch(() => {});
    throw err;
  }
}

export async function setToolCredentials(
  workspaceId: string,
  id: string,
  headers: Record<string, string>,
): Promise<Tool> {
  const tool = await getTool(workspaceId, id);
  const catalog = await getEngine().setCatalogCredentials(tool.engineCatalogId, headers);
  const { rows } = await query<ToolRow>(
    "UPDATE tools SET credential_headers = $1 WHERE id = $2 AND workspace_id = $3 RETURNING *",
    [catalog.credentialHeaders ?? [], id, workspaceId],
  );
  return toTool(rows[0]);
}

export async function deleteTool(workspaceId: string, id: string): Promise<void> {
  const tool = await getTool(workspaceId, id);
  const { rows } = await query<{ name: string }>(
    "SELECT name FROM flows WHERE workspace_id = $1 AND $2::uuid = ANY(tool_ids) ORDER BY name LIMIT 5",
    [workspaceId, id],
  );
  if (rows.length > 0) {
    throw new HttpError(
      409,
      "tool_in_use",
      `This tool is used by: ${rows.map((r) => r.name).join(", ")}. Delete those flows first.`,
    );
  }
  await getEngine().deleteCatalog(tool.engineCatalogId);
  await query("DELETE FROM tools WHERE id = $1 AND workspace_id = $2", [id, workspaceId]);
}

/** Maps tool ids to engine catalog ids, failing if any is not in this workspace. */
export async function catalogIdsFor(workspaceId: string, toolIds: string[]): Promise<string[]> {
  const unique = [...new Set(toolIds)];
  if (unique.length === 0) return [];
  if (!unique.every(isUuid)) throw badRequest("Unknown tool");
  const { rows } = await query<{ engine_catalog_id: string }>(
    "SELECT engine_catalog_id FROM tools WHERE workspace_id = $1 AND id = ANY($2::uuid[])",
    [workspaceId, unique],
  );
  if (rows.length !== unique.length) throw badRequest("One of the selected tools does not exist in this workspace");
  return rows.map((r) => r.engine_catalog_id);
}

/* ------------------------------- flows ------------------------------- */

export interface Flow {
  id: string;
  name: string;
  description: string;
  prompt: string;
  toolIds: string[];
  dag: Dag;
  defaultInput: Record<string, unknown>;
  suggestedSchedule: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

type FlowRow = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tool_ids: string[];
  dag: Dag;
  default_input: Record<string, unknown>;
  suggested_schedule: string | null;
  revision: number;
  created_at: Date;
  updated_at: Date;
};

const toFlow = (r: FlowRow): Flow => ({
  id: r.id,
  name: r.name,
  description: r.description,
  prompt: r.prompt,
  toolIds: r.tool_ids,
  dag: r.dag,
  defaultInput: r.default_input,
  suggestedSchedule: r.suggested_schedule,
  revision: r.revision,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export async function listFlows(workspaceId: string): Promise<Flow[]> {
  const { rows } = await query<FlowRow>("SELECT * FROM flows WHERE workspace_id = $1 ORDER BY updated_at DESC", [
    workspaceId,
  ]);
  return rows.map(toFlow);
}

export async function getFlow(workspaceId: string, id: string): Promise<Flow> {
  if (!isUuid(id)) throw notFound("Flow not found");
  const { rows } = await query<FlowRow>("SELECT * FROM flows WHERE id = $1 AND workspace_id = $2", [id, workspaceId]);
  if (rows.length === 0) throw notFound("Flow not found");
  return toFlow(rows[0]);
}

const MAX_PROMPT = 4000;

export function checkPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) throw badRequest("Describe what you want to automate");
  if (trimmed.length > MAX_PROMPT) throw badRequest(`Keep the prompt under ${MAX_PROMPT} characters`);
  return trimmed;
}

/** Builds what the engine compiles when an existing flow is re-prompted. */
export function revisionPrompts(flow: Flow, change: string): { stored: string; compiled: string } {
  const stored = `${flow.prompt}\n\nChange to make: ${change}`;
  const steps = flow.dag.nodes.map((n) => `- ${n.key} (${n.type}): ${n.name}`).join("\n");
  return {
    stored,
    compiled: `${stored}\n\nThe workflow currently has these steps. Keep everything the change does not touch:\n${steps}`,
  };
}

export async function saveCompilation(
  workspaceId: string,
  prompt: string,
  toolIds: string[],
  flowId: string | null,
  result: CompileResult,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO compilations (workspace_id, flow_id, prompt, tool_ids, plan, trace)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [workspaceId, flowId, prompt, toolIds, JSON.stringify(result.plan), JSON.stringify(result.trace)],
  );
  return rows[0].id;
}

async function loadCompilation(workspaceId: string, id: unknown) {
  if (!isUuid(id)) throw notFound("Compiled plan not found");
  const { rows } = await query<{
    id: string;
    flow_id: string | null;
    prompt: string;
    tool_ids: string[];
    plan: Plan;
    trace: Trace;
  }>("SELECT * FROM compilations WHERE id = $1 AND workspace_id = $2", [id, workspaceId]);
  if (rows.length === 0) throw notFound("Compiled plan not found");
  return rows[0];
}

export async function createFlowFromCompilation(
  workspaceId: string,
  compilationId: unknown,
  name?: string,
): Promise<Flow> {
  const c = await loadCompilation(workspaceId, compilationId);
  const { rows } = await query<FlowRow>(
    `INSERT INTO flows (workspace_id, name, description, prompt, tool_ids, dag, default_input, suggested_schedule)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      workspaceId,
      name?.trim() || c.plan.name || "Untitled flow",
      c.plan.description ?? "",
      c.prompt,
      c.tool_ids,
      JSON.stringify({ nodes: c.plan.nodes, defaultInput: c.plan.defaultInput ?? {} } satisfies Dag),
      JSON.stringify(c.plan.defaultInput ?? {}),
      c.plan.schedule,
    ],
  );
  return toFlow(rows[0]);
}

export async function applyCompilation(workspaceId: string, flowId: string, compilationId: unknown): Promise<Flow> {
  const flow = await getFlow(workspaceId, flowId);
  const c = await loadCompilation(workspaceId, compilationId);
  if (c.flow_id !== flow.id) throw badRequest("That plan was compiled for a different flow");
  const dag: Dag = { nodes: c.plan.nodes, defaultInput: c.plan.defaultInput ?? {} };

  // A schedule runs a snapshot of the DAG, so it has to move to the new one.
  const schedule = await getSchedule(workspaceId, flow.id);
  if (schedule) {
    await replaceEngineSchedule(workspaceId, flow, schedule, dag, c.tool_ids);
  }

  const { rows } = await query<FlowRow>(
    `UPDATE flows SET prompt = $1, dag = $2, default_input = $3, tool_ids = $4,
            description = $5, suggested_schedule = $6, revision = revision + 1, updated_at = now()
      WHERE id = $7 AND workspace_id = $8 RETURNING *`,
    [
      c.prompt,
      JSON.stringify(dag),
      JSON.stringify(c.plan.defaultInput ?? {}),
      c.tool_ids,
      c.plan.description ?? flow.description,
      c.plan.schedule,
      flow.id,
      workspaceId,
    ],
  );
  return toFlow(rows[0]);
}

export async function renameFlow(workspaceId: string, id: string, name: string): Promise<Flow> {
  await getFlow(workspaceId, id);
  const trimmed = name.trim();
  if (!trimmed) throw badRequest("Name can't be empty");
  const { rows } = await query<FlowRow>(
    "UPDATE flows SET name = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3 RETURNING *",
    [trimmed.slice(0, 120), id, workspaceId],
  );
  return toFlow(rows[0]);
}

export async function deleteFlow(workspaceId: string, id: string): Promise<void> {
  const flow = await getFlow(workspaceId, id);
  const schedule = await getSchedule(workspaceId, flow.id);
  if (schedule?.engineScheduleId) await getEngine().deleteSchedule(schedule.engineScheduleId);
  await query("DELETE FROM flows WHERE id = $1 AND workspace_id = $2", [id, workspaceId]);
}

/* ------------------------------- runs -------------------------------- */

const RESERVED_INPUT = "__apex";

function cleanInput(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw badRequest("Input must be an object");
  const { [RESERVED_INPUT]: _reserved, ...rest } = input as Record<string, unknown>;
  return rest;
}

export function visibleInput(input: Record<string, unknown> | undefined): Record<string, unknown> {
  const { [RESERVED_INPUT]: _reserved, ...rest } = input ?? {};
  return rest;
}

export interface RunRecord {
  id: string;
  engineRunId: string;
  flowId: string | null;
  flowName: string;
  status: RunStatus;
  trigger: "manual" | "schedule";
  dag: Dag;
  createdAt: string;
  finishedAt: string | null;
}

type RunRow = {
  id: string;
  engine_run_id: string;
  flow_id: string | null;
  flow_name: string;
  status: RunStatus;
  trigger: "manual" | "schedule";
  dag: Dag;
  created_at: Date;
  finished_at: Date | null;
};

const toRunRecord = (r: RunRow): RunRecord => ({
  id: r.id,
  engineRunId: r.engine_run_id,
  flowId: r.flow_id,
  flowName: r.flow_name,
  status: r.status,
  trigger: r.trigger,
  dag: r.dag,
  createdAt: r.created_at.toISOString(),
  finishedAt: r.finished_at?.toISOString() ?? null,
});

export async function launchRun(
  workspaceId: string,
  flowId: string,
  input: unknown,
  idempotencyKey?: string,
): Promise<RunRecord> {
  const flow = await getFlow(workspaceId, flowId);
  const merged = { ...flow.defaultInput, ...cleanInput(input) };
  const catalogIds = await catalogIdsFor(workspaceId, flow.toolIds);
  await consumeQuota(workspaceId, "runs");
  let run: Run;
  try {
    run = await getEngine().createRun({
      dag: flow.dag,
      catalogIds,
      input: merged,
      // Namespaced by workspace so one tenant's key can never collide with another's.
      ...(idempotencyKey ? { idempotencyKey: `${workspaceId}:${idempotencyKey}` } : {}),
    });
  } catch (err) {
    await refundQuota(workspaceId, "runs");
    throw err;
  }
  const { rows } = await query<RunRow>(
    `INSERT INTO runs (workspace_id, flow_id, flow_name, engine_run_id, status, trigger, dag)
     VALUES ($1, $2, $3, $4, $5, 'manual', $6)
     ON CONFLICT (engine_run_id) DO UPDATE SET status = EXCLUDED.status
     WHERE runs.workspace_id = EXCLUDED.workspace_id
     RETURNING *`,
    [workspaceId, flow.id, flow.name, run.id, run.status, JSON.stringify(flow.dag)],
  );
  if (rows.length === 0) throw new HttpError(409, "conflict", "That run id belongs to another workspace");
  return toRunRecord(rows[0]);
}

export async function listRuns(workspaceId: string, flowId?: string, limit = 100): Promise<RunRecord[]> {
  const { rows } = flowId
    ? await query<RunRow>(
        "SELECT * FROM runs WHERE workspace_id = $1 AND flow_id = $2 ORDER BY created_at DESC LIMIT $3",
        [workspaceId, flowId, limit],
      )
    : await query<RunRow>("SELECT * FROM runs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2", [
        workspaceId,
        limit,
      ]);
  return rows.map(toRunRecord);
}

/** The ownership check every run proxy call goes through. */
export async function getRunRecord(workspaceId: string, engineRunId: string): Promise<RunRecord> {
  const { rows } = await query<RunRow>("SELECT * FROM runs WHERE engine_run_id = $1 AND workspace_id = $2", [
    engineRunId,
    workspaceId,
  ]);
  if (rows.length === 0) throw notFound("Run not found");
  return toRunRecord(rows[0]);
}

async function recordRunState(workspaceId: string, run: Run): Promise<void> {
  await query(
    "UPDATE runs SET status = $1, finished_at = $2 WHERE engine_run_id = $3 AND workspace_id = $4",
    [run.status, run.finishedAt, run.id, workspaceId],
  );
}

export interface RunDetail {
  record: RunRecord;
  run: Run;
}

export async function getRunDetail(workspaceId: string, engineRunId: string): Promise<RunDetail> {
  const record = await getRunRecord(workspaceId, engineRunId);
  const run = await getEngine().getRun(engineRunId);
  await recordRunState(workspaceId, run);
  return {
    record: { ...record, status: run.status, finishedAt: run.finishedAt },
    run: { ...run, input: visibleInput(run.input) },
  };
}

export async function cancelRun(workspaceId: string, engineRunId: string): Promise<RunDetail> {
  const record = await getRunRecord(workspaceId, engineRunId);
  const run = await getEngine().cancelRun(engineRunId);
  await recordRunState(workspaceId, run);
  return { record: { ...record, status: run.status }, run: { ...run, input: visibleInput(run.input) } };
}

export async function approveRunNode(
  workspaceId: string,
  engineRunId: string,
  key: string,
  approved: boolean,
  note?: string,
): Promise<RunDetail> {
  const record = await getRunRecord(workspaceId, engineRunId);
  const run = await getEngine().approveNode(engineRunId, key, approved, note);
  await recordRunState(workspaceId, run);
  return { record: { ...record, status: run.status }, run: { ...run, input: visibleInput(run.input) } };
}

/* ----------------------------- schedules ----------------------------- */

export interface FlowSchedule {
  id: string;
  flowId: string;
  engineScheduleId: string | null;
  cron: string;
  status: "active" | "paused_quota";
  createdAt: string;
}

type ScheduleRow = {
  id: string;
  flow_id: string;
  engine_schedule_id: string | null;
  cron: string;
  status: "active" | "paused_quota";
  created_at: Date;
};

const toSchedule = (r: ScheduleRow): FlowSchedule => ({
  id: r.id,
  flowId: r.flow_id,
  engineScheduleId: r.engine_schedule_id,
  cron: r.cron,
  status: r.status,
  createdAt: r.created_at.toISOString(),
});

export async function getSchedule(workspaceId: string, flowId: string): Promise<FlowSchedule | null> {
  const { rows } = await query<ScheduleRow>("SELECT * FROM schedules WHERE flow_id = $1 AND workspace_id = $2", [
    flowId,
    workspaceId,
  ]);
  return rows[0] ? toSchedule(rows[0]) : null;
}

function scheduleInput(workspaceId: string, flow: Flow, scheduleId: string, dag: Dag) {
  return {
    ...(dag.defaultInput ?? flow.defaultInput),
    [RESERVED_INPUT]: { scheduleId, workspaceId, flowId: flow.id },
  };
}

async function replaceEngineSchedule(
  workspaceId: string,
  flow: Flow,
  schedule: FlowSchedule,
  dag: Dag,
  toolIds: string[],
): Promise<void> {
  const engine = getEngine();
  const catalogIds = await catalogIdsFor(workspaceId, toolIds);
  const created = await engine.createSchedule({
    cron: schedule.cron,
    dag,
    catalogIds,
    input: scheduleInput(workspaceId, flow, schedule.id, dag),
  });
  await query("UPDATE schedules SET engine_schedule_id = $1, status = 'active' WHERE id = $2 AND workspace_id = $3", [
    created.id,
    schedule.id,
    workspaceId,
  ]);
  if (schedule.engineScheduleId) await engine.deleteSchedule(schedule.engineScheduleId);
}

export async function setSchedule(workspaceId: string, flowId: string, cron: string): Promise<FlowSchedule> {
  const flow = await getFlow(workspaceId, flowId);
  const usage = await getUsage(workspaceId);
  if (usage.runs >= usage.runLimit) {
    throw new HttpError(429, "quota_exceeded", `This workspace has used all ${usage.runLimit} runs for the month.`);
  }
  const existing = await getSchedule(workspaceId, flow.id);
  const engine = getEngine();
  const id = existing?.id ?? randomUUID();
  const created = await engine.createSchedule({
    cron,
    dag: flow.dag,
    catalogIds: await catalogIdsFor(workspaceId, flow.toolIds),
    input: scheduleInput(workspaceId, flow, id, flow.dag),
  });
  try {
    const { rows } = await query<ScheduleRow>(
      `INSERT INTO schedules (id, workspace_id, flow_id, engine_schedule_id, cron, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (flow_id) DO UPDATE SET engine_schedule_id = EXCLUDED.engine_schedule_id,
         cron = EXCLUDED.cron, status = 'active'
       RETURNING *`,
      [id, workspaceId, flow.id, created.id, cron],
    );
    if (existing?.engineScheduleId) await engine.deleteSchedule(existing.engineScheduleId);
    return toSchedule(rows[0]);
  } catch (err) {
    await engine.deleteSchedule(created.id).catch(() => {});
    throw err;
  }
}

export async function removeSchedule(workspaceId: string, flowId: string): Promise<void> {
  const flow = await getFlow(workspaceId, flowId);
  const schedule = await getSchedule(workspaceId, flow.id);
  if (!schedule) throw notFound("This flow has no schedule");
  if (schedule.engineScheduleId) await getEngine().deleteSchedule(schedule.engineScheduleId);
  await query("DELETE FROM schedules WHERE id = $1 AND workspace_id = $2", [schedule.id, workspaceId]);
}

/**
 * The engine starts scheduled runs on its own, so they have to be claimed. Each
 * schedule's input carries a reserved marker with this product's schedule id;
 * only a marker matching one of this workspace's schedules is claimed.
 * If that pushes the workspace past its cap, its schedules are stopped.
 */
export async function syncScheduledRuns(workspaceId: string): Promise<void> {
  const { rows: schedules } = await query<{
    id: string;
    flow_id: string;
    engine_schedule_id: string | null;
    flow_name: string;
    dag: Dag;
  }>(
    `SELECT s.id, s.flow_id, s.engine_schedule_id, f.name AS flow_name, f.dag
       FROM schedules s JOIN flows f ON f.id = s.flow_id
      WHERE s.workspace_id = $1`,
    [workspaceId],
  );
  if (schedules.length === 0) return;
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const engine = getEngine();
  const runs = await engine.listRuns(200);

  let claimed = 0;
  for (const run of runs) {
    const marker = run.input?.[RESERVED_INPUT] as { scheduleId?: string } | undefined;
    const schedule = marker?.scheduleId ? byId.get(marker.scheduleId) : undefined;
    if (!schedule) continue;
    const { rowCount } = await query(
      `INSERT INTO runs (workspace_id, flow_id, flow_name, engine_run_id, status, trigger, dag, created_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, 'schedule', $6, $7, $8)
       ON CONFLICT (engine_run_id) DO NOTHING`,
      [
        workspaceId,
        schedule.flow_id,
        schedule.flow_name,
        run.id,
        run.status,
        JSON.stringify(schedule.dag),
        run.createdAt,
        run.finishedAt,
      ],
    );
    claimed += rowCount ?? 0;
  }
  if (claimed === 0) return;
  await addScheduledRuns(workspaceId, claimed);

  const usage = await getUsage(workspaceId);
  if (usage.runs < usage.runLimit) return;
  for (const schedule of schedules) {
    if (!schedule.engine_schedule_id) continue;
    await engine.deleteSchedule(schedule.engine_schedule_id);
    await query(
      "UPDATE schedules SET engine_schedule_id = NULL, status = 'paused_quota' WHERE id = $1 AND workspace_id = $2",
      [schedule.id, workspaceId],
    );
  }
}

const OPEN_RUN_REFRESH_LIMIT = 30;

/** Updates this workspace's unfinished runs, so lists do not need the run opened first. */
export async function refreshOpenRuns(workspaceId: string): Promise<void> {
  const { rows } = await query<{ engine_run_id: string }>(
    `SELECT engine_run_id FROM runs
      WHERE workspace_id = $1 AND finished_at IS NULL
      ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, OPEN_RUN_REFRESH_LIMIT],
  );
  const engine = getEngine();
  const runs = await Promise.all(rows.map((r) => engine.getRun(r.engine_run_id)));
  await Promise.all(runs.map((run) => recordRunState(workspaceId, run)));
}

/** Sync for page loads: an engine outage must not take the page down with it. */
export async function trySyncScheduledRuns(workspaceId: string): Promise<string | null> {
  try {
    await syncScheduledRuns(workspaceId);
    await refreshOpenRuns(workspaceId);
    return null;
  } catch (err) {
    if (err instanceof EngineError) return err.message;
    throw err;
  }
}

