export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly problems?: string[],
  ) {
    super(message);
  }
}

export async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { message?: string; problems?: string[] } };
    if (body.error?.message) return new ApiError(res.status, body.error.message, body.error.problems);
  } catch {
    // Fall through.
  }
  return new ApiError(res.status, `Request failed with status ${res.status}`);
}

export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw await errorFrom(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}
