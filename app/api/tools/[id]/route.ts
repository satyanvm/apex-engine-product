import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { getEngine } from "@/lib/engine-server";
import { deleteTool, getTool } from "@/lib/services";

export const GET = authed<{ id: string }>(async (_req, session, { id }) => {
  const tool = await getTool(session.workspaceId, id);
  const catalog = await getEngine().getCatalog(tool.engineCatalogId);
  return NextResponse.json({ tool, nodes: catalog.nodes ?? [] });
});

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await deleteTool(session.workspaceId, id);
  return new NextResponse(null, { status: 204 });
});
