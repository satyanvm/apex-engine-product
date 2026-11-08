import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, closeDb, readSSE, resetDb, sessionCookie, setupDb, startFakeEngine, type FakeEngine } from "./helpers";
import { POST as signUp } from "@/app/api/auth/sign-up/route";
import { POST as compile } from "@/app/api/compile/route";
import { POST as createFlow } from "@/app/api/flows/route";
import { POST as launch } from "@/app/api/flows/[id]/runs/route";
import { PUT as putSchedule } from "@/app/api/flows/[id]/schedule/route";
import { GET as getRuns } from "@/app/api/runs/route";
import { consumeQuota, getUsage, monthOf } from "@/lib/quota";
import { query } from "@/lib/db";

let engine: FakeEngine;
let cookie: string;
let workspaceId: string;

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
  cookie = sessionCookie(await call(signUp, { body: { email: "q@q.test", password: "long enough password" } }));
  workspaceId = (await query<{ id: string }>("SELECT id FROM workspaces")).rows[0].id;
});

async function setLimits(compiles: number, runs: number) {
  await query("UPDATE workspaces SET compile_limit = $1, run_limit = $2", [compiles, runs]);
}

async function makeFlow(): Promise<string> {
  const events = await readSSE(await call(compile, { cookie, body: { prompt: "p" } }));
  const compilationId = events.find((e) => e.event === "result")!.data.compilationId;
  return (await (await call(createFlow, { cookie, body: { compilationId } })).json()).flow.id;
}

describe("monthly quotas", () => {
  it("stops compiles at the cap with a 429 and never calls the engine", async () => {
    await setLimits(1, 10);
    const first = await call(compile, { cookie, body: { prompt: "a" } });
    expect(first.status).toBe(200);
    await first.text();
    engine.calls.length = 0;
    const res = await call(compile, { cookie, body: { prompt: "b" } });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("quota_exceeded");
    expect(engine.calls).toEqual([]);
  });

  it("stops runs at the cap", async () => {
    await setLimits(10, 1);
    const id = await makeFlow();
    expect((await call(launch, { cookie, params: { id }, body: {} })).status).toBe(202);
    expect((await call(launch, { cookie, params: { id }, body: {} })).status).toBe(429);
  });

  it("is exact under concurrency", async () => {
    await setLimits(5, 5);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => consumeQuota(workspaceId, "runs")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect((await getUsage(workspaceId)).runs).toBe(5);
  });

  it("resets with the calendar month", async () => {
    await setLimits(1, 1);
    const november = new Date("2026-11-30T23:59:00Z");
    const december = new Date("2026-12-01T00:01:00Z");
    await consumeQuota(workspaceId, "runs", november);
    await expect(consumeQuota(workspaceId, "runs", november)).rejects.toMatchObject({ status: 429 });
    await expect(consumeQuota(workspaceId, "runs", december)).resolves.toBeUndefined();
    expect(monthOf(december)).toBe("2026-12-01");
  });

  it("treats a limit of zero as closed", async () => {
    await setLimits(0, 0);
    await expect(consumeQuota(workspaceId, "compiles")).rejects.toMatchObject({ status: 429 });
  });

  it("uses the env defaults when the workspace has no override", async () => {
    process.env.MONTHLY_RUN_LIMIT = "3";
    expect((await getUsage(workspaceId)).runLimit).toBe(3);
    process.env.MONTHLY_RUN_LIMIT = "500";
  });

  it("refunds a run the engine refused, and passes the engine's reason through", async () => {
    await setLimits(10, 1);
    const id = await makeFlow();
    engine.override((c, res) => {
      if (c.path !== "/v1/runs") return false;
      res.writeHead(422, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "invalid_dag", message: "graph is broken", problems: ["x"] } }));
      return true;
    });
    const res = await call(launch, { cookie, params: { id }, body: {} });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { message: "graph is broken", problems: ["x"] } });
    expect((await getUsage(workspaceId)).runs).toBe(0);
  });

  it("reports an engine outage as 502 with the reason and refunds the run", async () => {
    await setLimits(10, 5);
    const id = await makeFlow();
    engine.override((c, res) => {
      if (c.path !== "/v1/runs") return false;
      res.destroy();
      return true;
    });
    const res = await call(launch, { cookie, params: { id }, body: {} });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("engine_unreachable");
    expect((await getUsage(workspaceId)).runs).toBe(0);
  });

  it("forwards a compile failure as an error event, with no invented plan", async () => {
    engine.override((c, res) => {
      if (c.path !== "/v1/compile/stream") return false;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`event: error\ndata: ${JSON.stringify({ message: "model quota exhausted" })}\n\n`);
      return true;
    });
    const events = await readSSE(await call(compile, { cookie, body: { prompt: "p" } }));
    expect(events).toEqual([{ event: "error", data: { message: "model quota exhausted" } }]);
    expect((await query("SELECT 1 FROM compilations")).rowCount).toBe(0);
  });

  it("reports a stream that ends with no result as an error", async () => {
    engine.override((c, res) => {
      if (c.path !== "/v1/compile/stream") return false;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end();
      return true;
    });
    const events = await readSSE(await call(compile, { cookie, body: { prompt: "p" } }));
    expect(events[0].event).toBe("error");
  });

  it("counts claimed scheduled runs and stops schedules once over the cap", async () => {
    await setLimits(10, 2);
    const id = await makeFlow();
    await call(putSchedule, { method: "PUT", cookie, params: { id }, body: { cron: "0 9 * * *" } });
    const input = (engine.calls.find((c) => c.path === "/v1/schedules")!.body as { input: object }).input;
    for (const n of [1, 2]) {
      engine.runsList.push({ id: `run_s${n}`, status: "succeeded", createdAt: "2026-11-08T10:00:00Z", finishedAt: null, error: null, input });
    }
    engine.calls.length = 0;
    await call(getRuns, { method: "GET", cookie });
    expect((await getUsage(workspaceId)).runs).toBe(2);
    expect(engine.calls.some((c) => c.method === "DELETE" && c.path.startsWith("/v1/schedules/"))).toBe(true);
    const { rows } = await query<{ status: string }>("SELECT status FROM schedules");
    expect(rows[0].status).toBe("paused_quota");
    // Syncing again claims nothing twice.
    await call(getRuns, { method: "GET", cookie });
    expect((await getUsage(workspaceId)).runs).toBe(2);
  });

  it("refuses to create a schedule when no runs remain", async () => {
    await setLimits(10, 0);
    const id = await makeFlow();
    const res = await call(putSchedule, { method: "PUT", cookie, params: { id }, body: { cron: "0 9 * * *" } });
    expect(res.status).toBe(429);
  });
});
