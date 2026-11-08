import { NextResponse } from "next/server";
import { authed, badRequest, isUuid, readJson, str } from "@/lib/api";
import { EngineError, type CompileEvent } from "@/lib/engine";
import { getEngine } from "@/lib/engine-server";
import { consumeQuota, refundQuota } from "@/lib/quota";
import { catalogIdsFor, checkPrompt, getFlow, revisionPrompts, saveCompilation } from "@/lib/services";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();
const frame = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export const POST = authed(async (req, session) => {
  const body = await readJson(req);
  const prompt = checkPrompt(str(body, "prompt"));
  const workspaceId = session.workspaceId;

  const flowId = body.flowId === undefined || body.flowId === null ? null : body.flowId;
  if (flowId !== null && !isUuid(flowId)) throw badRequest("Unknown flow");

  let storedPrompt = prompt;
  let compiledPrompt = prompt;
  let toolIds: string[];
  if (flowId !== null) {
    const flow = await getFlow(workspaceId, flowId);
    const revised = revisionPrompts(flow, prompt);
    storedPrompt = revised.stored;
    compiledPrompt = revised.compiled;
    toolIds = Array.isArray(body.toolIds) ? (body.toolIds as string[]) : flow.toolIds;
  } else {
    toolIds = Array.isArray(body.toolIds) ? (body.toolIds as string[]) : [];
  }
  const catalogIds = await catalogIdsFor(workspaceId, toolIds);

  await consumeQuota(workspaceId, "compiles");
  let events: AsyncGenerator<CompileEvent>;
  try {
    events = await getEngine().compileStream({ prompt: compiledPrompt, catalogIds }, req.signal);
  } catch (err) {
    // Nothing was compiled, so nothing was spent.
    if (err instanceof EngineError && err.status < 500) await refundQuota(workspaceId, "compiles");
    throw err;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let finished = false;
      try {
        for await (const item of events) {
          if (item.event === "stage") {
            controller.enqueue(frame("stage", item.data));
          } else if (item.event === "error") {
            finished = true;
            controller.enqueue(frame("error", item.data));
          } else {
            finished = true;
            const compilationId = await saveCompilation(workspaceId, storedPrompt, toolIds, flowId, item.data);
            controller.enqueue(frame("result", { compilationId, ...item.data }));
          }
        }
        if (!finished) {
          controller.enqueue(frame("error", { message: "The engine closed the stream without a result" }));
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.error("compile stream failed", err);
          const message = err instanceof EngineError ? err.message : "The compile stream failed";
          controller.enqueue(frame("error", { message }));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      return events.return(undefined).then(() => undefined);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
});
