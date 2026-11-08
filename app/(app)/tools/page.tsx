import type { Metadata } from "next";
import { ToolsClient } from "@/components/tools-client";
import { PageHeader } from "@/components/ui";
import { listTools } from "@/lib/services";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Tools" };

export default async function ToolsPage() {
  const session = await requireSession();
  const tools = await listTools(session.workspaceId);
  return (
    <>
      <PageHeader title="Tools" />
      <ToolsClient tools={tools} />
    </>
  );
}
