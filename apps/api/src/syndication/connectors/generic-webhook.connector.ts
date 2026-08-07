export interface ConnectorResult {
  success: boolean;
  externalId?: string;
  responsePayload?: unknown;
  error?: string;
}

export async function pushGenericWebhook(
  webhookUrl: string,
  payload: unknown,
  headers?: Record<string, string>,
): Promise<ConnectorResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      return { success: false, responsePayload: body, error: `HTTP ${res.status}` };
    }
    const externalId =
      typeof body === 'object' && body && 'id' in body
        ? String((body as any).id)
        : undefined;
    return { success: true, externalId, responsePayload: body };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
