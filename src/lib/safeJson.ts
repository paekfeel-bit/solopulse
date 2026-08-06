/**
 * Safe JSON parsing for fetch responses.
 * Prevents: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 * when a proxy returns HTML 502/404 pages.
 */

export async function readJsonResponse<T = unknown>(
  res: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const status = res.status;
  let text = "";
  try {
    text = await res.text();
  } catch {
    return { ok: false, error: `empty response HTTP ${status}`, status };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: `empty body HTTP ${status}`, status };
  }
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) {
    return {
      ok: false,
      error: `서버가 HTML 오류를 반환함 (HTTP ${status}) — API 경로 문제`,
      status,
    };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch {
    return {
      ok: false,
      error: `JSON 파싱 실패 HTTP ${status}: ${trimmed.slice(0, 80)}`,
      status,
    };
  }
}

export function parseJsonText<T = unknown>(
  text: string
): { ok: true; data: T } | { ok: false; error: string } {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    return { ok: false, error: "HTML instead of JSON" };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "parse error",
    };
  }
}
