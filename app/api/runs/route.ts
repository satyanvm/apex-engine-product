import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { listRuns, trySyncScheduledRuns } from "@/lib/services";

export const GET = authed(async (_req, session) => {
  const warning = await trySyncScheduledRuns(session.workspaceId);
  return NextResponse.json({ runs: await listRuns(session.workspaceId), warning });
});
