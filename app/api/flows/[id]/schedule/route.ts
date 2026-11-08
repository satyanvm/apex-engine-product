import { NextResponse } from "next/server";
import { authed, badRequest, readJson, str } from "@/lib/api";
import { isCron } from "@/lib/dag";
import { removeSchedule, setSchedule } from "@/lib/services";

export const PUT = authed<{ id: string }>(async (req, session, { id }) => {
  const cron = str(await readJson(req), "cron").trim();
  if (!isCron(cron)) throw badRequest("Use a 5-field cron expression, like 0 9 * * 1");
  return NextResponse.json({ schedule: await setSchedule(session.workspaceId, id, cron) });
});

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await removeSchedule(session.workspaceId, id);
  return new NextResponse(null, { status: 204 });
});
