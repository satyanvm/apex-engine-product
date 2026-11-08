import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ErrorNote, PageHeader, StatusPill } from "@/components/ui";
import { between, formatDate } from "@/lib/format";
import { listRuns, trySyncScheduledRuns } from "@/lib/services";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Runs" };

export default async function RunsPage() {
  const session = await requireSession();
  const warning = await trySyncScheduledRuns(session.workspaceId);
  const runs = await listRuns(session.workspaceId);
  return (
    <>
      <PageHeader title="Runs" />
      {warning && (
        <div className="mb-4">
          <ErrorNote message={`Scheduled runs couldn't be refreshed: ${warning}`} />
        </div>
      )}
      {runs.length === 0 ? (
        <EmptyState title="No runs yet" action={<Link href="/flows" className="btn btn-primary">Go to flows</Link>}>
          Start a flow and every step shows up here, with its inputs, outputs and failures.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/runs/${r.engineRunId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sunken/50">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{r.flowName}</span>
                  <span className="block truncate font-mono text-[11.5px] text-faint">
                    {formatDate(r.createdAt)}
                    {r.finishedAt ? ` · ${between(r.createdAt, r.finishedAt)}` : ""}
                    {r.trigger === "schedule" ? " · scheduled" : ""}
                  </span>
                </span>
                <StatusPill status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
