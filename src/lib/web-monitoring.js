import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { createRoutesFromChildren, matchRoutes, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { scrubSentryEvent, sentryPerformanceAttributes } from '../../mobile/src/lib/telemetry-privacy.js';
import { webAnalyticsRoute } from './web-analytics.js';

function webTraceName(name) {
    const path = typeof name === 'string' ? name.split(/[?#]/, 1)[0] : '';
    return path.startsWith('/') ? webAnalyticsRoute(path)?.path || '/other' : '/other';
}

function scrubWebSpan(span) {
    const attributes = sentryPerformanceAttributes(span.attributes);
    const name = span.is_segment ? webTraceName(span.name) : attributes['sentry.op'] || 'operation';
    for (const key of ['sentry.segment.name', 'sentry.transaction']) {
        if (span.attributes[key]) attributes[key] = webTraceName(span.attributes[key]);
    }
    for (const key of ['sentry.release', 'sentry.environment']) {
        if (span.attributes[key]) attributes[key] = span.attributes[key];
    }
    return { ...span, name, links: undefined, attributes };
}

export const MonitoredRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

export function initializeWebMonitoring() {
    const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
    if (!dsn) return;
    try {
        Sentry.init({
            dsn,
            environment: import.meta.env.VITE_TELEMETRY_ENV || 'production',
            sendDefaultPii: false,
            tracesSampleRate: 0.1,
            tracePropagationTargets: [],
            integrations: [Sentry.reactRouterV7BrowserTracingIntegration({
                useEffect, useLocation, useNavigationType, createRoutesFromChildren, matchRoutes,
            })],
            beforeBreadcrumb: () => null,
            beforeSend: scrubSentryEvent,
            beforeSendSpan: scrubWebSpan,
        });
    } catch { /* Monitoring configuration must not prevent the website from loading. */ }
}

export function reportWebError(error, flow) {
    try { Sentry.captureException(error, { tags: { flow, platform: 'web' } }); } catch { /* Preserve normal error handling. */ }
}
