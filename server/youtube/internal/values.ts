export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

export function firstNonBlankString(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}
