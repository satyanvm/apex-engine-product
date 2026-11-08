"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { ErrorNote, Spinner } from "./ui";
import { ApiError, api } from "@/lib/client";
import { isCron } from "@/lib/dag";

type Err = { message: string; problems?: string[] } | null;

function toErr(err: unknown): Err {
  return {
    message: err instanceof Error ? err.message : "Request failed",
    problems: err instanceof ApiError ? err.problems : undefined,
  };
}

export function RunForm({ flowId, defaultInput }: { flowId: string; defaultInput: Record<string, unknown> }) {
  const router = useRouter();
  const entries = useMemo(() => Object.entries(defaultInput), [defaultInput]);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      entries.map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v, null, 2) : v]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err>(null);

  function collect(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, original] of entries) {
      const value = values[key];
      if (original !== null && typeof original === "object") {
        try {
          out[key] = JSON.parse(String(value));
        } catch {
          throw new Error(`${key} must be valid JSON`);
        }
      } else if (typeof original === "number") {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
        out[key] = n;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { run } = await api<{ run: { engineRunId: string } }>(`/api/flows/${flowId}/runs`, "POST", {
        input: collect(),
        idempotencyKey: crypto.randomUUID(),
      });
      router.push(`/runs/${run.engineRunId}`);
      router.refresh();
    } catch (err) {
      setError(toErr(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} className="space-y-3">
      {entries.length === 0 && <p className="text-[13px] text-muted">This flow takes no input.</p>}
      {entries.map(([key, original]) => {
        const id = `input-${key}`;
        return (
          <div key={key}>
            <label htmlFor={id} className="mb-1 block font-mono text-[12px] text-muted">
              {key}
            </label>
            {typeof original === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(values[key])}
                onChange={(e) => setValues({ ...values, [key]: e.target.checked })}
              />
            ) : original !== null && typeof original === "object" ? (
              <textarea
                id={id}
                className="field min-h-20 font-mono text-[12.5px]"
                value={String(values[key] ?? "")}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            ) : (
              <input
                id={id}
                type={typeof original === "number" ? "number" : "text"}
                className="field"
                value={String(values[key] ?? "")}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            )}
          </div>
        );
      })}
      {error && <ErrorNote {...error} />}
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : <Play aria-hidden className="size-3.5" />}
        Run now
      </button>
    </form>
  );
}

const PRESETS = [
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Daily 09:00", cron: "0 9 * * *" },
  { label: "Mondays 09:00", cron: "0 9 * * 1" },
];

export function ScheduleForm({
  flowId,
  current,
  suggested,
}: {
  flowId: string;
  current: { cron: string; status: "active" | "paused_quota" } | null;
  suggested: string | null;
}) {
  const router = useRouter();
  const [cron, setCron] = useState(current?.cron ?? (suggested && isCron(suggested) ? suggested : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err>(null);

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/flows/${flowId}/schedule`, method, method === "PUT" ? { cron } : undefined);
      if (method === "DELETE") setCron("");
      router.refresh();
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {current?.status === "paused_quota" && (
        <ErrorNote message="This schedule was stopped because the workspace used all its runs for the month. Save it again to restart it once runs are available." />
      )}
      {current?.status === "active" && (
        <p className="text-[13px] text-muted">
          Running on <code className="font-mono text-[12.5px] text-ink">{current.cron}</code> (UTC)
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.cron} type="button" className="btn btn-ghost btn-sm" onClick={() => setCron(p.cron)}>
            {p.label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="cron" className="mb-1 block font-mono text-[12px] text-muted">
          cron
        </label>
        <input
          id="cron"
          className="field font-mono text-[13px]"
          placeholder="0 9 * * 1"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
        />
      </div>
      {error && <ErrorNote {...error} />}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={busy || !isCron(cron)}
          onClick={() => send("PUT")}
        >
          {busy && <Spinner />}
          {current ? "Update schedule" : "Schedule"}
        </button>
        {current && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => send("DELETE")}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export function DeleteFlowButton({ flowId, name }: { flowId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete "${name}"? Its schedule stops and this can't be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/flows/${flowId}`, "DELETE");
      router.push("/flows");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button className="btn btn-danger" disabled={busy} onClick={remove}>
        Delete
      </button>
      {error && <ErrorNote message={error} />}
    </div>
  );
}
