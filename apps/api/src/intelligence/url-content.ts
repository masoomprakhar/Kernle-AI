export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch a URL and extract main textual content, stripping common nav/boilerplate.
 * Injectable fetch for unit tests.
 */
export async function fetchUrlContent(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ text: string; title?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  const res = await fetchImpl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'User-Agent': 'KernleBot/1.0 (+product-intelligence)',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status})`);
  }

  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();
  if (contentType.includes('text/plain') || !contentType.includes('html')) {
    return { text: body.trim().slice(0, 100_000) };
  }

  return extractMainContent(body);
}

/** Pure HTML → main text (no DOM). Used by fetchUrlContent and tests. */
export function extractMainContent(html: string): { text: string; title?: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const mainMatch =
    cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i) ||
    cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i) ||
    cleaned.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);

  const chunk = mainMatch?.[1] || cleaned;
  const text = chunk
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 100_000);

  return { text, title };
}
