"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DagView } from "./dag-view";
import { StageList, type StageRow } from "./stage-list";
import { ErrorNote, Spinner } from "./ui";
import { ApiError, api, errorFrom } from "@/lib/client";
import { parseSSE, type CompileResult, type StageEvent } from "@/lib/engine";
import { formatDuration } from "@/lib/format";

const BASE_STAGES: StageRow[] = ["route", "map", "reduce", "validate"].map((stage) => ({ stage, status: "pending" }));

function applyStage(rows: StageRow[], e: StageEvent): StageRow[] {
  const next = [...rows];
  let index = -1;
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].stage === e.stage) {
      index = i;
      break;
    }
  }
  // A stage that starts again after finishing (repair rounds) gets its own row.
  const repeats = index >= 0 && e.status === "start" && next[index].status !== "pending";
  if (index === -1 || repeats) {
    next.push({ stage: e.stage, status: e.status, detail: e.detail });
    return next;
  }
  next[index] = { ...next[index], status: e.status, detail: e.detail ?? next[index].detail };
  return next;
}

export interface ToolOption {
  id: string;
  name: string;
  nodeCount: number;
}

type Compiled = CompileResult & { compilationId: string };

export function CompilePanel({
  tools,
  flowId,
  initialToolIds,
}: {
  tools: ToolOption[];
  flowId?: string;
  initialToolIds?: string[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [toolIds, setToolIds] = useState<string[]>(initialToolIds ?? tools.map((t) => t.id));
  const [stages, setStages] = useState<StageRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Compiled | null>(null);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const revising = Boolean(flowId);

  function toggleTool(id: string) {
    setToolIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function failRunning(rows: StageRow[] | null): StageRow[] | null {
    return rows?.map((r) => (r.status === "start" ? { ...r, status: "failed" } : r)) ?? null;
  }

  async function compile(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStages(BASE_STAGES);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, toolIds, ...(flowId ? { flowId } : {}) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw await errorFrom(res);
      let finished = false;
      for await (const { event, data } of parseSSE(res.body)) {
        const parsed = JSON.parse(data);
        if (event === "stage") {
          setStages((rows) => applyStage(rows ?? BASE_STAGES, parsed as StageEvent));
        } else if (event === "error") {
          finished = true;
          setStages(failRunning);
          setError({ message: parsed.message });
        } else if (event === "result") {
          finished = true;
          const compiled = parsed as Compiled;
          setResult(compiled);
          setName(compiled.plan.name);
          setStages((rows) => rows?.filter((r) => r.status !== "pending") ?? null);
        }
      }
      if (!finished) throw new ApiError(502, "The connection closed before the plan finished.");
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStages(null);
      } else {
        setStages(failRunning);
        setError({
          message: err instanceof Error ? err.message : "Compile failed",
          problems: err instanceof ApiError ? err.problems : undefined,
        });
      }
    } finally {
      setRunning(false);
      abort.current = null;
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      if (flowId) {
        await api(`/api/flows/${flowId}`, "PATCH", { compilationId: result.compilationId });
        setResult(null);
        setStages(null);
        setPrompt("");
        router.refresh();
      } else {
        const { flow } = await api<{ flow: { id: string } }>("/api/flows", "POST", {
          compilationId: result.compilationId,
          name,
        });
        router.push(`/flows/${flow.id}`);
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={compile} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="sr-only">
            {revising ? "What should change?" : "What do you want to automate?"}
          </label>
          <textarea
            id="prompt"
            className="field min-h-28 resize-y text-[15px] leading-relaxed"
            placeholder={
              revising
                ? "Add an approval before anything is sent, and only include orders over 500."
                : "Every Monday, list overdue invoices, draft a reminder for each one, and send them after I approve."
            }
            value={prompt}
            maxLength={4000}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        {tools.length > 0 && (
          <fieldset>
            <legend className="eyebrow mb-2">Tools this flow may use</legend>
            <div className="flex flex-wrap gap-2">
              {tools.map((t) => {
                const on = toolIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] transition-colors ${
                      on ? "border-ink text-ink" : "border-line-strong text-muted"
                    }`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleTool(t.id)} className="sr-only" />
                    {t.name}
                    <span className="font-mono text-[10.5px] text-faint">{t.nodeCount}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={running || !prompt.trim()}>
            {running ? <Spinner /> : <ArrowRight aria-hidden className="size-3.5" />}
            {running ? "Compiling" : revising ? "Compile the change" : "Compile"}
          </button>
          {running && (
            <button type="button" className="btn btn-ghost" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          )}
        </div>
      </form>

      {stages && (
        <div className="card p-4">
          <p className="eyebrow mb-3">Compile</p>
          <StageList rows={stages} />
        </div>
      )}

      {error && <ErrorNote message={error.message} problems={error.problems} />}

      {result && (
        <section className="space-y-3" aria-label="Compiled plan">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13.5px] text-muted">{result.plan.description}</p>
            <p className="font-mono text-[11.5px] text-faint">
              {result.plan.nodes.length} steps · {formatDuration(result.trace.durationMs)} · {result.trace.repairs}{" "}
              {result.trace.repairs === 1 ? "repair" : "repairs"}
            </p>
          </div>
          <DagView nodes={result.plan.nodes} height={360} />
          <div className="flex flex-wrap items-end gap-3">
            {!revising && (
              <div className="min-w-56 flex-1">
                <label htmlFor="flow-name" className="eyebrow mb-1.5 block">
                  Name
                </label>
                <input id="flow-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving && <Spinner />}
              {revising ? "Apply this version" : "Save flow"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
