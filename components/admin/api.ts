export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const payload = (await response.json()) as { ok?: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? `Request failed with ${response.status}`);
  }
  if ("data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}
