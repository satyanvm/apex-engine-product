// Typed client for the apex-engine HTTP API (v1). See apex-engine/docs/API.md.
// Server-side only in practice: the API key comes from getEngine(), which lives
// in lib/engine-server.ts so client components can import these types safely.

export interface DagNode {
  key: string;
  type: string;
  name: string;
  dependsOn: string[];
  config: Record<string, unknown>;
  col?: number;
  row?: number;
}

export interface Dag {
  nodes: DagNode[];
  defaultInput?: Record<string, unknown>;
}

export interface CatalogField {
  key: string;
  label: string;
  control: string;
  required: boolean;
  help?: string;
}

export interface CatalogNode {
  id: string;
  label: string;
  description: string;
  kind: string;
  runtime: string;
  config: CatalogField[];
  outputs: string[];
}

export interface Catalog {
  id: string;
  name: string;
  kind: "openapi" | "mcp";
  baseUrl: string;
  nodeCount: number;
  hasCredentials: boolean;
  credentialHeaders: string[];
  createdAt: string;
  nodes?: CatalogNode[];
}

export type CatalogSource =
  | { type: "openapi"; url: string }
  | { type: "openapi"; spec: Record<string, unknown> }
  | { type: "mcp"; url: string; headers?: Record<string, string> };

export interface CreateCatalogRequest {
  name: string;
  source: CatalogSource;
  baseUrl?: string;
}

export interface Plan {
  name: string;
  description: string;
  nodes: DagNode[];
  defaultInput: Record<string, unknown>;
  schedule: string | null;
  tags: string[];
}

export type StageName = "route" | "map" | "reduce" | "validate" | "repair";

export interface TraceStage {
  stage: StageName;
  status: "done" | "failed";
  durationMs: number;
  detail: string;
}

export interface Trace {
  durationMs: number;
  stages: TraceStage[];
  repairs: number;
  models: { map: string; reduce: string };
}

export interface CompileRequest {
  prompt: string;
  catalogIds: string[];
  name?: string;
}

export interface CompileResult {
  plan: Plan;
  trace: Trace;
}

export interface StageEvent {
  stage: StageName;
  status: "start" | "done" | "failed";
  detail?: string;
}

export type CompileEvent =
  | { event: "stage"; data: StageEvent }
  | { event: "result"; data: CompileResult }
  | { event: "error"; data: { message: string } };

export interface ValidateResult {
  valid: boolean;
  problems: string[];
}

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export type NodeRunStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "skipped";

export interface NodeRun {
  key: string;
  type: string;
  name: string;
  status: NodeRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  output: unknown;
  error: string | null;
  attempts: number;
}

export interface Run {
  id: string;
  status: RunStatus;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  input: Record<string, unknown>;
  nodes: NodeRun[];
}

export interface CreateRunRequest {
  dag: Dag;
  catalogIds: string[];
  input: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface Schedule {
  id: string;
  cron: string;
  createdAt: string;
  paused: boolean;
}

export interface CreateScheduleRequest {
  cron: string;
  dag: Dag;
  catalogIds: string[];
  input: Record<string, unknown>;
}

export class EngineError extends Error {
  constructor(
    /** HTTP status, or 0 when the engine could not be reached. */
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly problems?: string[],
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export class EngineClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async send(
    method: string,
    path: string,
    body?: unknown,
    init?: { signal?: AbortSignal; accept?: string },
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        cache: "no-store",
        signal: init?.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: init?.accept ?? "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err);
      throw new EngineError(0, "engine_unreachable", `Could not reach the engine: ${cause}`);
    }
    if (res.ok) return res;
    throw await toEngineError(res);
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.send(method, path, body);
    return (await res.json()) as T;
  }

  private async empty(method: string, path: string): Promise<void> {
    const res = await this.send(method, path);
    await res.body?.cancel();
  }

  health(): Promise<{ status: string }> {
    return this.json("GET", "/healthz");
  }

  createCatalog(req: CreateCatalogRequest): Promise<Catalog> {
    return this.json("POST", "/v1/catalogs", req);
  }

  async listCatalogs(): Promise<Catalog[]> {
    return (await this.json<{ catalogs: Catalog[] }>("GET", "/v1/catalogs")).catalogs;
  }

  getCatalog(id: string): Promise<Catalog> {
    return this.json("GET", `/v1/catalogs/${encodeURIComponent(id)}`);
  }

  deleteCatalog(id: string): Promise<void> {
    return this.empty("DELETE", `/v1/catalogs/${encodeURIComponent(id)}`);
  }

  setCatalogCredentials(id: string, headers: Record<string, string>): Promise<Catalog> {
    return this.json("PUT", `/v1/catalogs/${encodeURIComponent(id)}/credentials`, { headers });
  }

  compile(req: CompileRequest): Promise<CompileResult> {
    return this.json("POST", "/v1/compile", req);
  }

  /**
   * Opens the compile stream. Connection and rejection errors throw from this
   * call, before the first event, so callers can answer with a real status.
   */
  async compileStream(req: CompileRequest, signal?: AbortSignal): Promise<AsyncGenerator<CompileEvent>> {
    const res = await this.send("POST", "/v1/compile/stream", req, {
      signal,
      accept: "text/event-stream",
    });
    if (!res.body) throw new EngineError(502, "bad_gateway", "The engine returned an empty compile stream");
    return compileEvents(res.body);
  }

  validate(dag: Dag, catalogIds: string[]): Promise<ValidateResult> {
    return this.json("POST", "/v1/validate", { dag, catalogIds });
  }

  createRun(req: CreateRunRequest): Promise<Run> {
    return this.json("POST", "/v1/runs", req);
  }

  async listRuns(limit = 50): Promise<Run[]> {
    return (await this.json<{ runs: Run[] }>("GET", `/v1/runs?limit=${limit}`)).runs;
  }

  getRun(id: string): Promise<Run> {
    return this.json("GET", `/v1/runs/${encodeURIComponent(id)}`);
  }

  cancelRun(id: string): Promise<Run> {
    return this.json("POST", `/v1/runs/${encodeURIComponent(id)}/cancel`);
  }

  approveNode(id: string, key: string, approved: boolean, note?: string): Promise<Run> {
    return this.json(
      "POST",
      `/v1/runs/${encodeURIComponent(id)}/nodes/${encodeURIComponent(key)}/approve`,
      note === undefined ? { approved } : { approved, note },
    );
  }

  createSchedule(req: CreateScheduleRequest): Promise<Schedule> {
    return this.json("POST", "/v1/schedules", req);
  }

  async listSchedules(): Promise<Schedule[]> {
    return (await this.json<{ schedules: Schedule[] }>("GET", "/v1/schedules")).schedules;
  }

  deleteSchedule(id: string): Promise<void> {
    return this.empty("DELETE", `/v1/schedules/${encodeURIComponent(id)}`);
  }
}

async function toEngineError(res: Response): Promise<EngineError> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as {
      error?: { code?: string; message?: string; problems?: string[] };
    };
    if (parsed.error?.message) {
      return new EngineError(
        res.status,
        parsed.error.code ?? "engine_error",
        parsed.error.message,
        parsed.error.problems,
      );
    }
  } catch {
    // Not the documented error shape; report the raw body below.
  }
  return new EngineError(
    res.status,
    "engine_error",
    `The engine returned ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
  );
}

async function* compileEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<CompileEvent> {
  for await (const { event, data } of parseSSE(body)) {
    if (event !== "stage" && event !== "result" && event !== "error") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new EngineError(502, "bad_gateway", `The engine sent an unreadable ${event} event`);
    }
    yield { event, data: parsed } as CompileEvent;
  }
}

/** Parses a text/event-stream body. Frames may split across any chunk boundary. */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = parseFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (frame) yield frame;
      }
      if (done) {
        const frame = parseFrame(buffer);
        if (frame) yield frame;
        return;
      }
    }
  } finally {
    reader.releaseLock();
    await body.cancel().catch(() => {});
  }
}

function parseFrame(frame: string): { event: string; data: string } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
