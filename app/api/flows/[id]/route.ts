import { NextResponse } from "next/server";
import { authed, badRequest, readJson, str } from "@/lib/api";
import { applyCompilation, deleteFlow, getFlow, renameFlow } from "@/lib/services";

export const GET = authed<{ id: string }>(async (_req, session, { id }) => {
  return NextResponse.json({ flow: await getFlow(session.workspaceId, id) });
});

export const PATCH = authed<{ id: string }>(async (req, session, { id }) => {
  const body = await readJson(req);
  if (body.compilationId !== undefined) {
    return NextResponse.json({ flow: await applyCompilation(session.workspaceId, id, body.compilationId) });
  }
  if (typeof body.name === "string") {
    return NextResponse.json({ flow: await renameFlow(session.workspaceId, id, str(body, "name")) });
  }
  throw badRequest("Nothing to update");
});

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await deleteFlow(session.workspaceId, id);
  return new NextResponse(null, { status: 204 });
});
