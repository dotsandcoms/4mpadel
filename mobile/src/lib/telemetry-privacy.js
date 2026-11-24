const POSTHOG_HOSTS = new Set(['https://eu.i.posthog.com', 'https://us.i.posthog.com']);

export function posthogHost(value) {
    return POSTHOG_HOSTS.has(value) ? value : 'https://eu.i.posthog.com';
}

export const analyticsIdentityInput = (id) =>
    typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id) ? '4m:analytics:v1:user:' + id.toLowerCase() : null;

const SENTRY_PROPERTIES = new Set(['app', 'browser', 'device', 'os', 'runtime']);
const SAFE_CONTEXT_FIELDS = new Set([
    'name', 'version', 'family', 'model', 'arch', 'app_version', 'app_build', 'simulator',
]);
const SENTRY_TAGS = new Set(['platform', 'flow']);

function safeDiagnosticText(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/(?:https?:\/\/|www\.)[^\s"']+/gi, '[url]')
        .replace(/[\w.+%-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
        .replace(/(?:bearer\s+|(?:token|password|secret|reference|email|code)\s*[:=]\s*)[^\s,;]+/gi, '[redacted]')
        .replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, '[id]')
        .replace(/\b[a-z0-9_-]{30,}(?:\.[a-z0-9_-]+){0,2}\b/gi, '[id]')
        .slice(0, 500);
}

function safeException(exception) {
    if (!exception) return exception;
    return {
        ...exception,
        values: exception.values?.map(value => ({
            ...value,
            value: safeDiagnosticText(value.value),
            stacktrace: value.stacktrace && {
                ...value.stacktrace,
                frames: value.stacktrace.frames?.map(frame => {
                    const { vars, pre_context, context_line, post_context, ...diagnostic } = frame;
                    return {
                        ...diagnostic,
                        filename: diagnostic.filename?.split(/[?#]/, 1)[0],
                        abs_path: diagnostic.abs_path?.split(/[?#]/, 1)[0],
                    };
                }),
            },
        })),
    };
}

/** Retain stack frames and release context for debugging. Drop request and account context. */
export function scrubSentryEvent(event) {
    const contexts = Object.fromEntries(Object.entries(event.contexts ?? {})
        .filter(([key, value]) => SENTRY_PROPERTIES.has(key) && value)
        .map(([key, value]) => [key, Object.fromEntries(Object.entries(value)
            .filter(([field]) => SAFE_CONTEXT_FIELDS.has(field))
            .map(([field, item]) => [field, safeDiagnosticText(item)]))]));

    return {
        ...event,
        user: undefined,
        request: undefined,
        extra: undefined,
        breadcrumbs: undefined,
        transaction: undefined,
        server_name: undefined,
        spans: undefined,
        contexts,
        tags: Object.fromEntries(Object.entries(event.tags ?? {}).filter(([tag]) => SENTRY_TAGS.has(tag))),
        message: safeDiagnosticText(event.message),
        logentry: event.logentry && { message: safeDiagnosticText(event.logentry.message) },
        exception: safeException(event.exception),
    };
}

const PERFORMANCE_MEASUREMENTS = new Set([
    'lcp', 'cls', 'fcp', 'inp', 'ttfb', 'ttfb.requestTime', 'fp', 'fid',
    'app_start_cold', 'app_start_warm', 'time_to_initial_display', 'time_to_full_display',
    'frames_total', 'frames_slow', 'frames_frozen', 'frames_slow_rate', 'frames_frozen_rate',
    'stall_count', 'stall_total_time', 'stall_longest_time', 'stall_percentage',
]);
const PERFORMANCE_UNITS = new Set(['millisecond', 'second', 'none', 'ratio', 'percent']);
const PERFORMANCE_METADATA = new Set([
    'sentry.op', 'sentry.origin', 'sentry.source', 'sentry.segment.name.source', 'sentry.trace.lifecycle',
    'sentry.sample_rate', 'sentry.exclusive_time',
]);

export function sentryPerformanceAttributes(attributes) {
    return Object.fromEntries(Object.entries(attributes ?? {}).filter(([key, value]) =>
        (PERFORMANCE_METADATA.has(key) && (Number.isFinite(value) || (typeof value === 'string' && /^[a-z_.]+$/.test(value)))) ||
        (Number.isFinite(value) && /^(?:browser\.web_vital\.(?:lcp|cls|fcp|inp|ttfb)\.[a-z_.]+|http\.(?:status_code|response\.status_code))$/.test(key)) ||
        ((key === 'sentry.pageload.span_id' || key === 'sentry.segment.id') && typeof value === 'string' && /^[a-f0-9]{16}$/.test(value))));
}

function performanceMeasurements(measurements) {
    return Object.fromEntries(Object.entries(measurements ?? {}).flatMap(([key, measurement]) => {
        if (!PERFORMANCE_MEASUREMENTS.has(key) || !Number.isFinite(measurement?.value)) return [];
        const unit = PERFORMANCE_UNITS.has(measurement.unit) ? measurement.unit : undefined;
        return [[key, { value: measurement.value, unit }]];
    }));
}

/** Keep timing and protocol metadata. Span descriptions may contain URLs or DOM text. */
function scrubSentryPerformanceSpan(span) {
    return {
        ...span,
        description: undefined,
        links: undefined,
        data: sentryPerformanceAttributes(span.data),
        measurements: span.measurements && performanceMeasurements(span.measurements),
    };
}

export function scrubSentryTransaction(event, name) {
    const cleaned = scrubSentryEvent(event);
    const trace = event.contexts?.trace;
    const { trace_id, span_id, parent_span_id, op, origin, status } = trace ?? {};
    return {
        ...cleaned,
        transaction: name,
        contexts: { ...cleaned.contexts, trace: trace && {
            trace_id, span_id, parent_span_id, op, origin, status, data: sentryPerformanceAttributes(trace.data),
        } },
        spans: event.spans?.map(scrubSentryPerformanceSpan),
        measurements: event.measurements && performanceMeasurements(event.measurements),
    };
}
