import * as Sentry from '@sentry/react';
import { scrubSentryEvent } from '../../mobile/src/lib/telemetry-privacy.js';

export function initializeWebMonitoring() {
    const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
    if (!dsn) return;
    try {
        Sentry.init({
            dsn,
            environment: import.meta.env.VITE_TELEMETRY_ENV || 'production',
            sendDefaultPii: false,
            beforeBreadcrumb: () => null,
            beforeSend: scrubSentryEvent,
        });
    } catch { /* Monitoring configuration must not prevent the website from loading. */ }
}

export function reportWebError(error, flow) {
    try { Sentry.captureException(error, { tags: { flow, platform: 'web' } }); } catch { /* Preserve normal error handling. */ }
}
