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

const registrationSteps = {
    prepare_entry: 'entry preparation',
    save_entries: 'entry save',
    save_pay_later: 'pay-later entry save',
    reserve_places: 'reservation of division places',
    save_checkout: 'checkout record creation',
    open_checkout: 'Paystack checkout launch',
    send_confirmation: 'registration confirmation',
    update_schedule: 'schedule update',
    refresh_entry: 'entry refresh',
};
const errorKinds = new Set(['Error', 'TypeError', 'AbortError', 'TimeoutError', 'PostgrestError', 'FunctionsHttpError', 'FunctionsFetchError', 'FunctionsRelayError']);
const registrationProblems = new Map([
    ['This event or division is full. No payment has been started.', 'division_full'],
    ['This event does not allow register now, pay later.', 'pay_later_unavailable'],
    ['Sign in before registering.', 'sign_in_required'],
    ['Unlock this event before registering.', 'access_required'],
    ['Registration has closed. Only existing active entries can be paid; no new entries or partners can be added.', 'registration_closed'],
    ['Payments have closed. Contact the organiser about your outstanding entry fees.', 'payment_closed'],
    ['You or your partner already have an entry in this division. Refresh the page to review your entries and continue payment.', 'duplicate_entry'],
]);
const knownRegistrationProblems = new Set(registrationProblems.values());

function registrationTags({ registration_step, entry_save_confirmed, registration_problem, backend_code, http_status, error_kind } = {}) {
    if (typeof registration_step !== 'string' || !Object.hasOwn(registrationSteps, registration_step)) return {};

    // Backend messages and details can contain player data. Keep fixed labels and protocol codes only.
    return {
        registration_step,
        entry_save_confirmed: entry_save_confirmed === 'yes' ? 'yes' : 'unknown',
        ...(knownRegistrationProblems.has(registration_problem) ? { registration_problem } : {}),
        ...(typeof backend_code === 'string' && /^(?:[0-9]{2}[0-9A-Z]{3}|P[0-9]{4}|PGRST[0-9]{3}|XX[0-9]{3})$/.test(backend_code) ? { backend_code } : {}),
        ...(typeof http_status === 'string' && /^[45][0-9]{2}$/.test(http_status) ? { http_status } : {}),
        ...(errorKinds.has(error_kind) ? { error_kind } : {}),
    };
}

function scrubWebSentryEvent(event) {
    const scrubbed = scrubSentryEvent(event);
    if (event.tags?.flow !== 'registration') return scrubbed;
    return { ...scrubbed, tags: { ...scrubbed.tags, ...registrationTags(event.tags) } };
}

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
            beforeSend: scrubWebSentryEvent,
            beforeSendSpan: scrubWebSpan,
        });
    } catch { /* Monitoring configuration must not prevent the website from loading. */ }
}

export function reportWebError(error, flow) {
    try { Sentry.captureException(error, { tags: { flow, platform: 'web' } }); } catch { /* Preserve normal error handling. */ }
}

export function reportRegistrationError(error, step, entrySaved) {
    try {
        const tags = registrationTags({
            registration_step: step,
            entry_save_confirmed: entrySaved ? 'yes' : 'unknown',
            registration_problem: registrationProblems.get(error?.message),
            backend_code: error?.code,
            http_status: String(error?.context?.status ?? error?.status ?? ''),
            error_kind: error?.name,
        });
        const label = registrationSteps[tags.registration_step] || 'registration';
        const reason = tags.registration_problem || tags.backend_code || tags.http_status || tags.error_kind;
        const report = new Error(`Event registration failed during ${label}${reason ? ` (${reason})` : ''}`);
        Sentry.captureException(report, {
            tags: { flow: 'registration', platform: 'web', ...tags },
            fingerprint: ['4m-event-registration', tags.registration_step || 'unknown', reason || 'unknown'],
        });
    } catch { /* Preserve normal error handling. */ }
}
