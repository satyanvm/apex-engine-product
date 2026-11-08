import { NextResponse } from "next/server";
import { authed, badRequest, readJson, str } from "@/lib/api";
import { approveRunNode } from "@/lib/services";

export const POST = authed<{ id: string; key: string }>(async (req, session, { id, key }) => {
  const body = await readJson(req);
  if (typeof body.approved !== "boolean") throw badRequest("approved must be true or false");
  const note = str(body, "note").slice(0, 1000) || undefined;
  return NextResponse.json(await approveRunNode(session.workspaceId, id, key, body.approved, note));
});
