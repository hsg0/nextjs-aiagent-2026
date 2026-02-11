/**
 * Resolve an IP address to a readable location string using ip-api.com (no key required).
 * Returns "Local / private network" for private/local IPs, "Unknown" on error.
 */
const PRIVATE_PREFIXES = ["127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "::1", "fc00:", "fe80:"];

function isPrivateOrLocal(ip) {
  if (!ip || typeof ip !== "string") return true;
  const trimmed = ip.trim();
  if (!trimmed) return true;
  return PRIVATE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export async function getLocationFromIp(ip) {
  if (!ip || typeof ip !== "string") return "Unknown";
  const trimmed = ip.trim();
  if (!trimmed) return "Unknown";
  if (isPrivateOrLocal(trimmed)) return "Local / private network";

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(trimmed)}?fields=status,country,regionName,city`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.status !== "success") return "Unknown";
    const parts = [data.city, data.regionName, data.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "Unknown";
  } catch (err) {
    console.error("getLocationFromIp:", err.message);
    return "Unknown";
  }
}
