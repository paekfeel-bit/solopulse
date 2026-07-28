/** Normalize payout / login address → bridge clientId (multi-user isolation) */

export function toClientId(address: string | null | undefined): string {
  const a = (address || "").trim();
  if (!a) return "default";
  // keep bc1... / 1... / 3... readable; strip spaces
  return a.replace(/\s+/g, "");
}

export function clientIdShort(id: string, n = 10): string {
  if (!id || id === "default") return "default";
  if (id.length <= n * 2) return id;
  return `${id.slice(0, n)}…${id.slice(-6)}`;
}
