"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DagView } from "./dag-view";
import { CodeBlock, ErrorNote, Spinner, StatusPill } from "./ui";
import { ApiError, api } from "@/lib/client";
import type { Dag, NodeRun, NodeRunStatus, Run } from "@/lib/engine";
import { between, formatDate, pretty } from "@/lib/format";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const POLL_MS = 1500;

type Detail = { run: Run };

function Approval({ node, onDecide }: { node: NodeRun; onDecide: (approved: boolean, note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<boolean | null>(null);
  async function decide(approved: boolean) {
    setBusy(approved);
    try {
      await onDecide(approved, note);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-3 rounded-md border border-wait/40 bg-wait-tint p-3">
      <p className="text-[13px] font-medium text-wait">This step is waiting for your decision.</p>
      <label htmlFor={`note-${node.key}`} className="sr-only">
        Note
      </label>
      <input
        id={`note-${node.key}`}
        className="field mt-2"
        placeholder="Add a note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => decide(true)}>
          {busy === true && <Spinner className="size-3" />}
          Approve
        </button>
        <button className="btn btn-danger btn-sm" disabled={busy !== null} onClick={() => decide(false)}>
          {busy === false && <Spinner className="size-3" />}
          Reject
        </button>
      </div>
    </div>
  );
}

export function RunView({
  runId,
  flowId,
  flowName,
  trigger,
  dag,
  initial,
  initialError,
}: {
  runId: string;
  flowId: string | null;
  flowName: string;
  trigger: "manual" | "schedule";
  dag: Dag;
  initial: Run | null;
  initialError: string | null;
}) {
  const [run, setRun] = useState<Run | null>(initial);
  const [pollError, setPollError] = useState<string | null>(initialError);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [gone, setGone] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const detail = await api<Detail>(`/api/runs/${encodeURIComponent(runId)}`);
      if (!alive.current) return null;
      setRun(detail.run);
      setPollError(null);
      return detail.run;
    } catch (err) {
      if (alive.current) {
        setPollError(err instanceof Error ? err.message : "Could not refresh this run");
        // The run no longer exists on the engine; polling can't bring it back.
        if (err instanceof ApiError && err.status === 404) setGone(true);
      }
      return null;
    }
  }, [runId]);

  const terminal = run ? TERMINAL.has(run.status) : false;

  useEffect(() => {
    alive.current = true;
    if (terminal || gone) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh, terminal, gone]);

  const statuses = useMemo(() => {
    const out: Record<string, NodeRunStatus> = {};
    for (const n of run?.nodes ?? []) out[n.key] = n.status;
    return out;
  }, [run]);

  async function act(path: string, body?: unknown) {
    setActionError(null);
    try {
      const detail = await api<Detail>(path, "POST", body);
      setRun(detail.run);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That action failed");
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this run? Steps already finished are not undone.")) return;
    setCancelling(true);
    await act(`/api/runs/${encodeURIComponent(runId)}/cancel`);
    setCancelling(false);
  }

  const decide = (key: string) => (approved: boolean, note: string) =>
    act(`/api/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(key)}/approve`, {
      approved,
      ...(note ? { note } : {}),
    });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">
            {trigger === "schedule" ? "Scheduled run" : "Run"} · {runId}
          </p>
          <h1 className="display text-[34px] break-words sm:text-[40px]">
            {flowId ? (
              <Link href={`/flows/${flowId}`} className="hover:text-accent">
                {flowName}
              </Link>
            ) : (
              flowName
            )}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
            {run && <StatusPill status={run.status} />}
            {run && <span>Started {formatDate(run.createdAt)}</span>}
            {run?.finishedAt && <span>Took {between(run.createdAt, run.finishedAt)}</span>}
          </div>
        </div>
        {run && !terminal && (
          <button className="btn btn-danger" onClick={cancel} disabled={cancelling}>
            {cancelling && <Spinner />}
            Cancel run
          </button>
        )}
      </header>

      {pollError && <ErrorNote message={pollError} />}
      {actionError && <ErrorNote message={actionError} />}
      {run?.error && <ErrorNote message={run.error} />}

      <DagView nodes={dag.nodes} statuses={statuses} selectedKey={selected} onSelect={setSelected} height={360} />

      {run && (
        <section aria-label="Steps" className="card divide-y divide-line">
          {run.nodes.map((node) => {
            const open = selected === node.key || node.status === "waiting_approval";
            const hasDetail = node.output != null || Boolean(node.error);
            return (
              <div key={node.key} className="px-4 py-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  aria-expanded={open}
                  onClick={() => setSelected(selected === node.key ? null : node.key)}
                >
                  <ChevronRight
                    aria-hidden
                    className={`size-3.5 shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{node.name || node.key}</span>
                    <span className="block truncate font-mono text-[11px] text-faint">{node.type}</span>
                  </span>
                  {node.attempts > 1 && (
                    <span className="hidden font-mono text-[11px] text-wait sm:inline">{node.attempts} attempts</span>
                  )}
                  <span className="hidden font-mono text-[11px] text-faint sm:inline">
                    {between(node.startedAt, node.finishedAt)}
                  </span>
                  <StatusPill status={node.status} />
                </button>
                {open && (
                  <div className="mt-3 space-y-3 pl-6.5">
                    {node.error && <ErrorNote message={node.error} />}
                    {node.output != null && <CodeBlock value={pretty(node.output)} />}
                    {!hasDetail && node.status !== "waiting_approval" && (
                      <p className="text-[12.5px] text-faint">No output yet.</p>
                    )}
                    {node.status === "waiting_approval" && <Approval node={node} onDecide={decide(node.key)} />}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {run && Object.keys(run.input).length > 0 && (
        <section>
          <p className="eyebrow mb-2">Input</p>
          <CodeBlock value={pretty(run.input)} />
        </section>
      )}
    </div>
  );
}
