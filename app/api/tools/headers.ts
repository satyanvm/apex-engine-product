import { badRequest } from "@/lib/api";

export function headerMap(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw badRequest("Headers must be an object");
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(name)) throw badRequest(`Invalid header name: ${name}`);
    if (typeof value !== "string" || !value) throw badRequest(`Header ${name} needs a value`);
    if (/[\r\n]/.test(value)) throw badRequest(`Header ${name} has an invalid value`);
    out[name] = value;
  }
  return out;
}
