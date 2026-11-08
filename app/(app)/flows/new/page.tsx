import type { Metadata } from "next";
import Link from "next/link";
import { CompilePanel } from "@/components/compile-panel";
import { EmptyState, PageHeader } from "@/components/ui";
import { listTools } from "@/lib/services";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "New flow" };

export default async function NewFlowPage() {
  const session = await requireSession();
  const tools = await listTools(session.workspaceId);
  return (
    <>
      <PageHeader eyebrow="New flow" title="What should happen?" />
      {tools.length === 0 ? (
        <EmptyState title="Connect a tool first" action={<Link href="/tools" className="btn btn-primary">Add a tool</Link>}>
          Plans can only use tools you&apos;ve connected.
        </EmptyState>
      ) : (
        <CompilePanel tools={tools.map((t) => ({ id: t.id, name: t.name, nodeCount: t.nodeCount }))} />
      )}
    </>
  );
}
