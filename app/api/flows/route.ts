import { NextResponse } from "next/server";
import { authed, readJson, str } from "@/lib/api";
import { createFlowFromCompilation, listFlows } from "@/lib/services";

export const GET = authed(async (_req, session) => {
  return NextResponse.json({ flows: await listFlows(session.workspaceId) });
});

export const POST = authed(async (req, session) => {
  const body = await readJson(req);
  const flow = await createFlowFromCompilation(session.workspaceId, body.compilationId, str(body, "name"));
  return NextResponse.json({ flow }, { status: 201 });
});
