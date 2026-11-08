import http from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { migrate } from "../scripts/migrate.mjs";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is required, e.g. postgres://apex:apex@localhost:55433/apex_test");
}
process.env.DATABASE_URL = url;
process.env.APP_URL = "http://localhost:3100";
process.env.ENGINE_API_KEY = "test-engine-key";
process.env.MONTHLY_COMPILE_LIMIT = "100";
process.env.MONTHLY_RUN_LIMIT = "500";

export const ORIGIN = "http://localhost:3100";

export async function setupDb(): Promise<void> {
  await migrate(url as string);
}

export async function resetDb(): Promise<void> {
  await pool().query(
    "TRUNCATE users, workspaces, memberships, sessions, rate_limits, tools, flows, compilations, schedules, runs, usage CASCADE",
  );
}

export async function closeDb(): Promise<void> {
  await pool().end();
  (globalThis as unknown as { apexPool?: unknown }).apexPool = undefined;
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  path?: string;
  body?: unknown;
  cookie?: string;
  params?: Record<string, string>;
  origin?: string | null;
  ip?: string;
}

export function call(handler: unknown, opts: CallOptions = {}): Promise<Response> {
  const method = opts.method ?? "POST";
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.cookie) headers.set("cookie", opts.cookie);
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin !== null && method !== "GET") headers.set("origin", origin);
  if (opts.ip) headers.set("x-real-ip", opts.ip);
  const req = new NextRequest(ORIGIN + (opts.path ?? "/api/x"), {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
}

/** The name=value pair from a response's Set-Cookie, for sending back. */
export function sessionCookie(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw.split(";")[0];
}

export interface EngineCall {
  method: string;
  path: string;
  body: unknown;
  auth: string | undefined;
}

export interface FakeEngine {
  url: string;
  calls: EngineCall[];
  /** Override one route; return false to fall through to the default. */
  override: (fn: (call: EngineCall, res: http.ServerResponse) => boolean) => void;
  runsList: Array<Record<string, unknown>>;
  close: () => Promise<void>;
}

export const samplePlan = {
  name: "Weekly digest",
  description: "Summarise and send",
  nodes: [
    { key: "start", type: "trigger.manual", name: "Start", dependsOn: [], config: {} },
    { key: "fetch", type: "api.acme.listOrders", name: "List orders", dependsOn: ["start"], config: {} },
    { key: "ok", type: "logic.approval", name: "Approve", dependsOn: ["fetch"], config: { message: "Send?" } },
  ],
  defaultInput: { region: "eu" },
  schedule: null,
  tags: [],
};

export const sampleTrace = {
  durationMs: 1200,
  stages: [{ stage: "route", status: "done", durationMs: 10, detail: "1 cluster" }],
  repairs: 0,
  models: { map: "m", reduce: "r" },
};

const runBody = (id: string, status = "running", input: unknown = {}) => ({
  id,
  status,
  createdAt: "2026-11-08T10:00:00Z",
  finishedAt: null,
  error: null,
  input,
  nodes: [
    {
      key: "ok",
      type: "logic.approval",
      name: "Approve",
      status: "waiting_approval",
      startedAt: "2026-11-08T10:00:01Z",
      finishedAt: null,
      output: null,
      error: null,
      attempts: 1,
    },
  ],
});

export async function startFakeEngine(): Promise<FakeEngine> {
  const calls: EngineCall[] = [];
  let override: ((c: EngineCall, res: http.ServerResponse) => boolean) | undefined;
  let seq = 0;
  const runsList: Array<Record<string, unknown>> = [];

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const path = req.url ?? "";
      const method = req.method ?? "";
      const entry: EngineCall = {
        method,
        path,
        body: raw ? JSON.parse(raw) : undefined,
        auth: req.headers.authorization,
      };
      calls.push(entry);
      if (override?.(entry, res)) return;
      const send = (status: number, body?: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body === undefined ? undefined : JSON.stringify(body));
      };
      if (method === "POST" && path === "/v1/catalogs") {
        return send(201, {
          id: `cat_${++seq}`,
          name: (entry.body as { name: string }).name,
          kind: "openapi",
          baseUrl: "https://api.acme.test",
          nodeCount: 3,
          hasCredentials: false,
          credentialHeaders: [],
          createdAt: "2026-11-08T10:00:00Z",
        });
      }
      if (method === "PUT" && /\/credentials$/.test(path)) {
        return send(200, {
          id: path.split("/")[3],
          name: "x",
          kind: "openapi",
          baseUrl: "",
          nodeCount: 3,
          hasCredentials: true,
          credentialHeaders: Object.keys((entry.body as { headers: object }).headers),
          createdAt: "2026-11-08T10:00:00Z",
        });
      }
      if (method === "DELETE") return send(204);
      if (method === "POST" && path === "/v1/compile/stream") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`event: stage\ndata: ${JSON.stringify({ stage: "route", status: "start" })}\n\n`);
        res.write(`event: stage\ndata: ${JSON.stringify({ stage: "route", status: "done", detail: "1" })}\n\n`);
        res.end(`event: result\ndata: ${JSON.stringify({ plan: samplePlan, trace: sampleTrace })}\n\n`);
        return;
      }
      if (method === "POST" && path === "/v1/runs") {
        return send(202, runBody(`run_${++seq}`, "queued", (entry.body as { input: unknown }).input));
      }
      if (method === "GET" && path.startsWith("/v1/runs?")) return send(200, { runs: runsList });
      if (method === "GET" && path.startsWith("/v1/runs/")) return send(200, runBody(path.split("/")[3]));
      if (method === "POST" && /\/cancel$/.test(path)) return send(200, runBody(path.split("/")[3], "cancelled"));
      if (method === "POST" && /\/approve$/.test(path)) return send(200, runBody(path.split("/")[3], "running"));
      if (method === "POST" && path === "/v1/schedules") {
        return send(201, {
          id: `sch_${++seq}`,
          cron: (entry.body as { cron: string }).cron,
          createdAt: "2026-11-08T10:00:00Z",
          paused: false,
        });
      }
      send(404, { error: { code: "not_found", message: `no route ${method} ${path}` } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const engineUrl = `http://127.0.0.1:${port}`;
  process.env.ENGINE_URL = engineUrl;
  return {
    url: engineUrl,
    calls,
    runsList,
    override: (fn) => {
      override = fn;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export async function readSSE(res: Response): Promise<Array<{ event: string; data: any }>> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split("\n");
      return {
        event: lines.find((l) => l.startsWith("event: "))!.slice(7),
        data: JSON.parse(lines.find((l) => l.startsWith("data: "))!.slice(6)),
      };
    });
}
