export function buildOverlayUrl(origin: string) {
  return new URL("/overlay", origin).toString();
}
