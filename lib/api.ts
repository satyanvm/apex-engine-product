import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { EngineError } from "./engine";
import { SESSION_COOKIE, sessionFromToken, type SessionInfo } from "./auth";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, "not_found", what);
export const badRequest = (message: string) => new HttpError(400, "bad_request", message);

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...err.extra } },
      { status: err.status },
    );
  }
  if (err instanceof EngineError) {
    // A 4xx is about the request and passes through. Anything else means the
    // engine itself failed, so the product answers 502 with the engine's reason.
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.problems ? { problems: err.problems } : {}),
        },
      },
      { status },
    );
  }
  console.error("unhandled route error", err);
  return NextResponse.json(
    { error: { code: "internal", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

function isMutation(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

/** Rejects a state-changing request unless its Origin is this app. */
export function assertSameOrigin(req: NextRequest): void {
  if (!isMutation(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) throw new HttpError(403, "bad_origin", "Missing Origin header");
  let allowed: string;
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    allowed = new URL(appUrl).origin;
  } else {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    allowed = `${proto}://${host}`;
  }
  let given: string;
  try {
    given = new URL(origin).origin;
  } catch {
    throw new HttpError(403, "bad_origin", "Invalid Origin header");
  }
  if (given !== allowed) throw new HttpError(403, "bad_origin", "Cross-origin request rejected");
}

export type Params = Record<string, string>;
export type RouteContext<P extends Params = Params> = { params: Promise<P> };

export function route<P extends Params = Params>(
  fn: (req: NextRequest, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      assertSameOrigin(req);
      return await fn(req, await ctx.params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function authed<P extends Params = Params>(
  fn: (req: NextRequest, session: SessionInfo, params: P) => Promise<Response>,
) {
  return route<P>(async (req, params) => {
    const session = await sessionFromToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) throw new HttpError(401, "unauthorized", "Sign in to continue");
    return fn(req, session, params);
  });
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Reported below.
  }
  throw badRequest("Request body must be a JSON object");
}

export function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}
