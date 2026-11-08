import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunView } from "@/components/run-view";
import { HttpError } from "@/lib/api";
import { EngineError, type Run } from "@/lib/engine";
import { getRunDetail, getRunRecord, type RunRecord } from "@/lib/services";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  let record: RunRecord;
  try {
    record = await getRunRecord(session.workspaceId, id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
  let run: Run | null = null;
  let error: string | null = null;
  try {
    run = (await getRunDetail(session.workspaceId, id)).run;
  } catch (err) {
    if (!(err instanceof EngineError)) throw err;
    error = err.message;
  }
  return (
    <RunView
      runId={id}
      flowId={record.flowId}
      flowName={record.flowName}
      trigger={record.trigger}
      dag={record.dag}
      initial={run}
      initialError={error}
    />
  );
}
