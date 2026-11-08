import { NextResponse } from "next/server";
import { authed, badRequest, readJson, str } from "@/lib/api";
import type { CatalogSource, CreateCatalogRequest } from "@/lib/engine";
import { createTool, listTools } from "@/lib/services";
import { headerMap } from "./headers";

export const GET = authed(async (_req, session) => {
  return NextResponse.json({ tools: await listTools(session.workspaceId) });
});

function parseSpec(text: string): Record<string, unknown> {
  try {
    const spec: unknown = JSON.parse(text);
    if (spec && typeof spec === "object" && !Array.isArray(spec)) return spec as Record<string, unknown>;
  } catch {
    // Reported below.
  }
  throw badRequest("Pasted spec must be OpenAPI JSON. For YAML, use a URL instead.");
}

function httpUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    // Reported below.
  }
  throw badRequest("Enter a full http(s) URL");
}

export const POST = authed(async (req, session) => {
  const body = await readJson(req);
  const name = str(body, "name").trim();
  if (!name) throw badRequest("Give this tool a name");
  const kind = str(body, "kind");
  const headers = headerMap(body.headers);
  let source: CatalogSource;
  if (kind === "openapi-url") {
    source = { type: "openapi", url: httpUrl(str(body, "url")) };
  } else if (kind === "openapi-spec") {
    source = { type: "openapi", spec: parseSpec(str(body, "spec")) };
  } else if (kind === "mcp") {
    source = {
      type: "mcp",
      url: httpUrl(str(body, "url")),
      ...(Object.keys(headers).length ? { headers } : {}),
    };
  } else {
    throw badRequest("Choose an OpenAPI URL, a pasted OpenAPI spec, or an MCP server");
  }
  const baseUrl = str(body, "baseUrl").trim();
  const catalog: CreateCatalogRequest = {
    name: name.slice(0, 80),
    source,
    ...(baseUrl ? { baseUrl: httpUrl(baseUrl) } : {}),
  };
  const tool = await createTool(session.workspaceId, catalog, headers);
  return NextResponse.json({ tool }, { status: 201 });
});
