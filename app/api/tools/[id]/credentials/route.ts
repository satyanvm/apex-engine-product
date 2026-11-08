import { NextResponse } from "next/server";
import { authed, badRequest, readJson } from "@/lib/api";
import { setToolCredentials } from "@/lib/services";
import { headerMap } from "../../headers";

export const PUT = authed<{ id: string }>(async (req, session, { id }) => {
  const headers = headerMap((await readJson(req)).headers);
  if (Object.keys(headers).length === 0) throw badRequest("Add at least one header");
  return NextResponse.json({ tool: await setToolCredentials(session.workspaceId, id, headers) });
});
