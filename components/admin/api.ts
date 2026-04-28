export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const text = await response.text();
  let payload: { ok?: boolean; data?: T; error?: { message?: string } };
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `Request failed with ${response.status}`);
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? `Request failed with ${response.status}`);
  }
  if ("data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}
