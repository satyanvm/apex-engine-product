import "server-only";
import { EngineClient, EngineError } from "./engine";

export function getEngine(): EngineClient {
  const url = process.env.ENGINE_URL;
  const key = process.env.ENGINE_API_KEY;
  if (!url || !key) {
    throw new EngineError(0, "engine_not_configured", "ENGINE_URL and ENGINE_API_KEY must be set on the server");
  }
  return new EngineClient(url, key);
}
