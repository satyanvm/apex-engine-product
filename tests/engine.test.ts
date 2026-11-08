import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { EngineClient, EngineError, parseSSE, type CompileEvent } from "@/lib/engine";

type Recorded = { method?: string; url?: string; auth?: string; body: string };
let recorded: Recorded[] = [];
let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void;
let server: http.Server;
let client: EngineClient;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      recorded.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      respond(req, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client = new EngineClient(`${baseUrl}/`, "secret-key");
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  recorded = [];
  respond = (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  };
});

function reply(status: number, body: unknown) {
  respond = (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
}

describe("EngineClient", () => {
  it("sends the bearer key and the documented path and body for every call", async () => {
    const dag = { nodes: [] };
    const cases: Array<[() => Promise<unknown>, string, string, unknown]> = [
      [() => client.health(), "GET", "/healthz", undefined],
      [() => client.createCatalog({ name: "A", source: { type: "openapi", url: "https://a.test/o.json" } }), "POST", "/v1/catalogs", { name: "A", source: { type: "openapi", url: "https://a.test/o.json" } }],
      [() => client.getCatalog("cat 1"), "GET", "/v1/catalogs/cat%201", undefined],
      [() => client.setCatalogCredentials("c", { Authorization: "Bearer x" }), "PUT", "/v1/catalogs/c/credentials", { headers: { Authorization: "Bearer x" } }],
      [() => client.compile({ prompt: "p", catalogIds: ["c"] }), "POST", "/v1/compile", { prompt: "p", catalogIds: ["c"] }],
      [() => client.validate(dag, ["c"]), "POST", "/v1/validate", { dag, catalogIds: ["c"] }],
      [() => client.createRun({ dag, catalogIds: [], input: { a: 1 } }), "POST", "/v1/runs", { dag, catalogIds: [], input: { a: 1 } }],
      [() => client.getRun("r"), "GET", "/v1/runs/r", undefined],
      [() => client.cancelRun("r"), "POST", "/v1/runs/r/cancel", undefined],
      [() => client.approveNode("r", "k", false, "no"), "POST", "/v1/runs/r/nodes/k/approve", { approved: false, note: "no" }],
      [() => client.createSchedule({ cron: "0 9 * * 1", dag, catalogIds: [], input: {} }), "POST", "/v1/schedules", { cron: "0 9 * * 1", dag, catalogIds: [], input: {} }],
    ];
    for (const [fn, method, path, body] of cases) {
      recorded = [];
      await fn();
      expect(recorded[0].method).toBe(method);
      expect(recorded[0].url).toBe(path);
      expect(recorded[0].auth).toBe("Bearer secret-key");
      expect(recorded[0].body ? JSON.parse(recorded[0].body) : undefined).toEqual(body);
    }
  });

  it("unwraps list responses", async () => {
    reply(200, { catalogs: [{ id: "a" }] });
    expect(await client.listCatalogs()).toEqual([{ id: "a" }]);
    reply(200, { runs: [{ id: "r" }] });
    expect(await client.listRuns(7)).toEqual([{ id: "r" }]);
    expect(recorded.at(-1)?.url).toBe("/v1/runs?limit=7");
    reply(200, { schedules: [{ id: "s" }] });
    expect(await client.listSchedules()).toEqual([{ id: "s" }]);
  });

  it("handles 204 deletes", async () => {
    respond = (_req, res) => {
      res.writeHead(204);
      res.end();
    };
    await expect(client.deleteCatalog("c")).resolves.toBeUndefined();
    await expect(client.deleteSchedule("s")).resolves.toBeUndefined();
  });

  it("maps the documented error shape, including problems", async () => {
    reply(422, { error: { code: "invalid_dag", message: "bad graph", problems: ["node a: unknown type"] } });
    const err = await client.createRun({ dag: { nodes: [] }, catalogIds: [], input: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(err).toMatchObject({ status: 422, code: "invalid_dag", message: "bad graph", problems: ["node a: unknown type"] });
  });

  it("keeps the raw body when an error is not the documented shape", async () => {
    reply(500, "upstream exploded");
    const err = await client.getRun("r").catch((e) => e);
    expect(err).toMatchObject({ status: 500, code: "engine_error" });
    expect(err.message).toContain("upstream exploded");
  });

  it("reports an unreachable engine as status 0 with the cause", async () => {
    const dead = new EngineClient("http://127.0.0.1:1", "k");
    const err = await dead.health().catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: "engine_unreachable" });
    expect(err.message).toMatch(/Could not reach the engine/);
  });

  it("streams compile events split across arbitrary chunk boundaries", async () => {
    const wire =
      `event: stage\r\ndata: {"stage":"route","status":"start"}\r\n\r\n` +
      `: keepalive\n\n` +
      `event: stage\ndata: {"stage":"route","status":"done","detail":"é"}\n\n` +
      `event: result\ndata: {"plan":{"name":"n"},"trace":{"repairs":0}}\n\n`;
    const bytes = Buffer.from(wire);
    respond = (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      let i = 0;
      const tick = () => {
        if (i >= bytes.length) return res.end();
        res.write(bytes.subarray(i, i + 3));
        i += 3;
        setImmediate(tick);
      };
      tick();
    };
    const out: CompileEvent[] = [];
    for await (const e of await client.compileStream({ prompt: "p", catalogIds: [] })) out.push(e);
    expect(out.map((e) => e.event)).toEqual(["stage", "stage", "result"]);
    expect(out[1].data).toMatchObject({ detail: "é" });
    expect(recorded[0].url).toBe("/v1/compile/stream");
  });

  it("throws before the first event when the stream is rejected", async () => {
    reply(400, { error: { code: "bad_request", message: "prompt is required" } });
    await expect(client.compileStream({ prompt: "", catalogIds: [] })).rejects.toMatchObject({ status: 400 });
  });

  it("parses a final frame with no trailing blank line, and multi-line data", async () => {
    const stream = new Blob(["data: a\ndata: b\n\nevent: x\ndata: c"]).stream();
    const frames = [];
    for await (const f of parseSSE(stream)) frames.push(f);
    expect(frames).toEqual([
      { event: "message", data: "a\nb" },
      { event: "x", data: "c" },
    ]);
  });
});
