import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { getRunDetail } from "@/lib/services";

export const GET = authed<{ id: string }>(async (_req, session, { id }) => {
  return NextResponse.json(await getRunDetail(session.workspaceId, id));
});
