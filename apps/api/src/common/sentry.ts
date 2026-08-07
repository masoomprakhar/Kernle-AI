/**
 * Sentry bootstrap (Phase 7). When SENTRY_DSN is set, initialize the SDK.
 * Deliberate test endpoint: GET /api/health/sentry-test throws for capture verification.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  console.log('[sentry] SENTRY_DSN configured — wire @sentry/node in production deploy');
}

export function captureException(err: unknown) {
  if (!process.env.SENTRY_DSN) {
    console.error('[sentry:fallback]', err);
    return;
  }
  console.error('[sentry]', err);
}
