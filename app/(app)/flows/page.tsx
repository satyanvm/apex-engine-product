import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { listFlows, listTools } from "@/lib/services";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Flows" };

export default async function FlowsPage() {
  const session = await requireSession();
  const [flows, tools] = await Promise.all([listFlows(session.workspaceId), listTools(session.workspaceId)]);
  const newFlow = (
    <Link href="/flows/new" className="btn btn-primary">
      <Plus aria-hidden className="size-3.5" /> New flow
    </Link>
  );
  return (
    <>
      <PageHeader title="Flows">{flows.length > 0 && newFlow}</PageHeader>
      {flows.length === 0 ? (
        tools.length === 0 ? (
          <EmptyState title="Start by connecting a tool" action={<Link href="/tools" className="btn btn-primary">Add a tool</Link>}>
            A flow is built from the operations of the APIs you connect. Add one, then describe what it should do.
          </EmptyState>
        ) : (
          <EmptyState title="Write your first flow" action={newFlow}>
            Describe the job in a sentence. You&apos;ll review the plan before anything runs.
          </EmptyState>
        )
      ) : (
        <ul className="card divide-y divide-line">
          {flows.map((f) => (
            <li key={f.id}>
              <Link href={`/flows/${f.id}`} className="block px-4 py-3.5 transition-colors hover:bg-sunken/50">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="truncate text-[14.5px] font-medium">{f.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-faint">{f.dag.nodes.length} steps</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{f.description || f.prompt}</p>
                <p className="mt-1 font-mono text-[11px] text-faint">Updated {formatDate(f.updatedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
