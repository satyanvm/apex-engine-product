import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompilePanel } from "@/components/compile-panel";
import { DeleteFlowButton, RunForm, ScheduleForm } from "@/components/flow-actions";
import { FlowGraph } from "@/components/flow-graph";
import { ErrorNote, PageHeader, StatusPill } from "@/components/ui";
import { HttpError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { getFlow, getSchedule, listRuns, listTools, trySyncScheduledRuns, type Flow } from "@/lib/services";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Flow" };

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  let flow: Flow;
  try {
    flow = await getFlow(session.workspaceId, id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
  const syncWarning = await trySyncScheduledRuns(session.workspaceId);
  const [schedule, runs, tools] = await Promise.all([
    getSchedule(session.workspaceId, flow.id),
    listRuns(session.workspaceId, flow.id, 20),
    listTools(session.workspaceId),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={`Flow · revision ${flow.revision}`} title={flow.name}>
        <DeleteFlowButton flowId={flow.id} name={flow.name} />
      </PageHeader>
      {syncWarning && <ErrorNote message={`Scheduled runs couldn't be refreshed: ${syncWarning}`} />}
      {flow.description && <p className="-mt-4 max-w-[70ch] text-[15px] leading-relaxed text-muted">{flow.description}</p>}

      <FlowGraph nodes={flow.dag.nodes} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="eyebrow mb-3">Run</h2>
          <RunForm flowId={flow.id} defaultInput={flow.defaultInput} />
        </section>
        <section className="card p-5">
          <h2 className="eyebrow mb-3">Schedule</h2>
          <ScheduleForm
            flowId={flow.id}
            current={schedule ? { cron: schedule.cron, status: schedule.status } : null}
            suggested={flow.suggestedSchedule}
          />
        </section>
      </div>

      <section>
        <h2 className="display mb-1 text-[26px]">Change it</h2>
        <p className="mb-4 text-[13.5px] text-muted">
          Say what should be different. You&apos;ll see the new plan before it replaces this one.
        </p>
        <CompilePanel
          flowId={flow.id}
          tools={tools.map((t) => ({ id: t.id, name: t.name, nodeCount: t.nodeCount }))}
          initialToolIds={flow.toolIds}
        />
      </section>

      <section>
        <h2 className="display mb-3 text-[26px]">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-[13.5px] text-muted">No runs yet.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/runs/${r.engineRunId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-sunken/50">
                  <span className="font-mono text-[12px] text-muted">
                    {formatDate(r.createdAt)}
                    {r.trigger === "schedule" ? " · scheduled" : ""}
                  </span>
                  <StatusPill status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="text-[13px] text-muted">
        <summary className="cursor-pointer">Original request</summary>
        <p className="mt-2 max-w-[70ch] whitespace-pre-wrap">{flow.prompt}</p>
      </details>
    </div>
  );
}
