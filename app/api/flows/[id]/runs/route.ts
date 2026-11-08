import { NextResponse } from "next/server";
import { authed, readJson, str } from "@/lib/api";
import { launchRun } from "@/lib/services";

export const POST = authed<{ id: string }>(async (req, session, { id }) => {
  const body = await readJson(req);
  const run = await launchRun(session.workspaceId, id, body.input, str(body, "idempotencyKey") || undefined);
  return NextResponse.json({ run }, { status: 202 });
});
