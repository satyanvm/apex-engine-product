import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { cancelRun } from "@/lib/services";

export const POST = authed<{ id: string }>(async (_req, session, { id }) => {
  return NextResponse.json(await cancelRun(session.workspaceId, id));
});
