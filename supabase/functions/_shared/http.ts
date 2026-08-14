export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

export function errorResponse(error: unknown, status = 500): Response {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'Unexpected provider error';
  return json({ error: message }, status);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A JSON object body is required');
  }
  return value as Record<string, unknown>;
}

export async function providerJson(url: string, init: RequestInit, timeoutMs = 8_000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Provider HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
