const PRIVATE_V4 =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.|169\.254\.)/;

/** Telegram fetches href from their servers. localhost / LAN / http never work. */
export function storageEndpointReachableFromTelegram(
  endpoint: string | undefined,
): boolean {
  if (!endpoint) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) {
    return false;
  }
  if (PRIVATE_V4.test(host)) return false;
  return true;
}
