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
