import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, closeDb, readSSE, resetDb, sessionCookie, setupDb, startFakeEngine, type FakeEngine } from "./helpers";
import { POST as signUp } from "@/app/api/auth/sign-up/route";
import { GET as getTools, POST as createTool } from "@/app/api/tools/route";
import { GET as getToolById, DELETE as deleteTool } from "@/app/api/tools/[id]/route";
import { PUT as putCredentials } from "@/app/api/tools/[id]/credentials/route";
import { POST as compile } from "@/app/api/compile/route";
import { GET as getFlows, POST as createFlow } from "@/app/api/flows/route";
import { GET as getFlow, PATCH as patchFlow, DELETE as deleteFlow } from "@/app/api/flows/[id]/route";
import { POST as launch } from "@/app/api/flows/[id]/runs/route";
import { PUT as putSchedule, DELETE as deleteSchedule } from "@/app/api/flows/[id]/schedule/route";
import { GET as getRuns } from "@/app/api/runs/route";
import { GET as getRun } from "@/app/api/runs/[id]/route";
import { POST as cancelRun } from "@/app/api/runs/[id]/cancel/route";
import { POST as approve } from "@/app/api/runs/[id]/nodes/[key]/approve/route";
import { query } from "@/lib/db";

let engine: FakeEngine;
let alice: string;
let bob: string;
let toolId: string;
let flowId: string;
let compilationId: string;
let runId: string;

async function user(email: string) {
  const res = await call(signUp, { body: { email, password: "long enough password" } });
  return sessionCookie(res);
}

beforeAll(async () => {
  await setupDb();
  engine = await startFakeEngine();
});
afterAll(async () => {
  await engine.close();
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
  engine.override(() => false);
  engine.runsList.length = 0;
  alice = await user("alice@a.test");
  bob = await user("bob@b.test");
  const tool = await call(createTool, {
    cookie: alice,
    body: { name: "Acme", kind: "openapi-url", url: "https://acme.test/o.json", headers: { Authorization: "Bearer s3cret" } },
  });
  expect(tool.status).toBe(201);
  toolId = (await tool.json()).tool.id;
  const stream = await call(compile, { cookie: alice, body: { prompt: "do it", toolIds: [toolId] } });
  const events = await readSSE(stream);
  compilationId = events.find((e) => e.event === "result")!.data.compilationId;
  const flow = await call(createFlow, { cookie: alice, body: { compilationId } });
  flowId = (await flow.json()).flow.id;
  const run = await call(launch, { cookie: alice, params: { id: flowId }, body: { input: {} } });
  runId = (await run.json()).run.engineRunId;
  engine.calls.length = 0;
});

describe("workspace isolation", () => {
  it("lists nothing of another workspace", async () => {
    expect((await (await call(getTools, { method: "GET", cookie: bob })).json()).tools).toEqual([]);
    expect((await (await call(getFlows, { method: "GET", cookie: bob })).json()).flows).toEqual([]);
    expect((await (await call(getRuns, { method: "GET", cookie: bob })).json()).runs).toEqual([]);
  });

  it("answers 404 for another workspace's flow, on every verb, and changes nothing", async () => {
    const params = { id: flowId };
    expect((await call(getFlow, { method: "GET", cookie: bob, params })).status).toBe(404);
    expect((await call(patchFlow, { method: "PATCH", cookie: bob, params, body: { name: "stolen" } })).status).toBe(404);
    expect((await call(deleteFlow, { method: "DELETE", cookie: bob, params })).status).toBe(404);
    expect((await call(launch, { cookie: bob, params, body: {} })).status).toBe(404);
    expect((await call(putSchedule, { method: "PUT", cookie: bob, params, body: { cron: "0 9 * * 1" } })).status).toBe(404);
    expect((await call(deleteSchedule, { method: "DELETE", cookie: bob, params })).status).toBe(404);
    const { rows } = await query<{ name: string }>("SELECT name FROM flows WHERE id = $1", [flowId]);
    expect(rows[0].name).toBe("Weekly digest");
    expect(engine.calls).toEqual([]);
  });

  it("never proxies another workspace's run to the engine", async () => {
    const params = { id: runId };
    expect((await call(getRun, { method: "GET", cookie: bob, params })).status).toBe(404);
    expect((await call(cancelRun, { cookie: bob, params })).status).toBe(404);
    expect((await call(approve, { cookie: bob, params: { id: runId, key: "ok" }, body: { approved: true } })).status).toBe(404);
    expect(engine.calls).toEqual([]);
    expect((await call(getRun, { method: "GET", cookie: alice, params })).status).toBe(200);
  });

  it("refreshes open runs on the list, only for the caller's workspace", async () => {
    engine.override((c, res) => {
      if (c.method !== "GET" || !c.path.startsWith("/v1/runs/")) return false;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: runId, status: "succeeded", createdAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:01:00Z", error: null, input: {}, nodes: [] }));
      return true;
    });
    await call(getRuns, { method: "GET", cookie: bob });
    expect(engine.calls.filter((c) => c.path.startsWith("/v1/runs/"))).toEqual([]);
    const { runs } = await (await call(getRuns, { method: "GET", cookie: alice })).json();
    expect(runs[0].status).toBe("succeeded");
    engine.calls.length = 0;
    await call(getRuns, { method: "GET", cookie: alice });
    expect(engine.calls.filter((c) => c.path.startsWith("/v1/runs/"))).toEqual([]);
  });

  it("never proxies another workspace's tool to the engine", async () => {
    const params = { id: toolId };
    expect((await call(getToolById, { method: "GET", cookie: bob, params })).status).toBe(404);
    expect((await call(deleteTool, { method: "DELETE", cookie: bob, params })).status).toBe(404);
    expect((await call(putCredentials, { method: "PUT", cookie: bob, params, body: { headers: { A: "b" } } })).status).toBe(404);
    expect(engine.calls).toEqual([]);
  });

  it("refuses to compile against another workspace's tool", async () => {
    const res = await call(compile, { cookie: bob, body: { prompt: "steal", toolIds: [toolId] } });
    expect(res.status).toBe(400);
    expect(engine.calls).toEqual([]);
  });

  it("refuses to save another workspace's compiled plan", async () => {
    const res = await call(createFlow, { cookie: bob, body: { compilationId } });
    expect(res.status).toBe(404);
  });

  it("refuses to re-prompt another workspace's flow", async () => {
    const res = await call(compile, { cookie: bob, body: { prompt: "change", flowId } });
    expect(res.status).toBe(404);
    expect(engine.calls).toEqual([]);
  });

  it("answers 404, not 500, for malformed ids", async () => {
    expect((await call(getFlow, { method: "GET", cookie: alice, params: { id: "not-a-uuid" } })).status).toBe(404);
    expect((await call(getToolById, { method: "GET", cookie: alice, params: { id: "'; DROP" } })).status).toBe(404);
  });

  it("claims scheduled runs only for the workspace whose schedule started them", async () => {
    const res = await call(putSchedule, { method: "PUT", cookie: alice, params: { id: flowId }, body: { cron: "0 9 * * 1" } });
    expect(res.status).toBe(200);
    const created = engine.calls.find((c) => c.path === "/v1/schedules")!;
    const input = (created.body as { input: Record<string, unknown> }).input;
    engine.runsList.push(
      { id: "run_sched", status: "succeeded", createdAt: "2026-11-08T10:00:00Z", finishedAt: "2026-11-08T10:01:00Z", error: null, input },
      { id: "run_other", status: "succeeded", createdAt: "2026-11-08T10:00:00Z", finishedAt: null, error: null, input: { __apex: { scheduleId: "11111111-1111-1111-1111-111111111111" } } },
    );
    const bobRuns = await (await call(getRuns, { method: "GET", cookie: bob })).json();
    expect(bobRuns.runs).toEqual([]);
    const aliceRuns = await (await call(getRuns, { method: "GET", cookie: alice })).json();
    const ids = aliceRuns.runs.map((r: { engineRunId: string }) => r.engineRunId);
    expect(ids).toContain("run_sched");
    expect(ids).not.toContain("run_other");
  });

  it("strips a forged schedule marker from manual run input", async () => {
    await call(launch, { cookie: alice, params: { id: flowId }, body: { input: { __apex: { scheduleId: "x" }, a: 1 } } });
    const sent = engine.calls.find((c) => c.path === "/v1/runs")!;
    expect(sent.body).toMatchObject({ input: { a: 1, region: "eu" } });
    expect((sent.body as { input: object }).input).not.toHaveProperty("__apex");
  });

  it("never returns credential values and sends only owned catalog ids", async () => {
    const tools = await (await call(getTools, { method: "GET", cookie: alice })).json();
    expect(JSON.stringify(tools)).not.toContain("s3cret");
    expect(tools.tools[0].credentialHeaders).toEqual(["Authorization"]);
    await call(launch, { cookie: alice, params: { id: flowId }, body: {} });
    const sent = engine.calls.find((c) => c.path === "/v1/runs")!;
    expect((sent.body as { catalogIds: string[] }).catalogIds).toEqual([tools.tools[0].engineCatalogId]);
  });
});
