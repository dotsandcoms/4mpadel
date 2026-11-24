import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsIdentityInput, posthogHost, scrubSentryEvent, scrubSentryTransaction, sentryPerformanceAttributes } from '../mobile/src/lib/telemetry-privacy.js';

test('web and mobile hash the same account input and reject non-account identifiers', () => {
    const id = 'ABB30000-B500-41EA-8FA3-EAA71004FA20';
    assert.equal(analyticsIdentityInput(id), '4m:analytics:v1:user:' + id.toLowerCase());
    assert.equal(analyticsIdentityInput('private@example.com'), null);
    assert.equal(analyticsIdentityInput(null), null);
    assert.equal(posthogHost('https://us.i.posthog.com'), 'https://us.i.posthog.com');
    assert.equal(posthogHost('https://example.com'), 'https://eu.i.posthog.com');
});

test('Sentry performance keeps timing and trace links without sending URLs, form inputs or user context', () => {
    const attributes = sentryPerformanceAttributes({
        'sentry.op': 'ui.webvital.lcp',
        'sentry.pageload.span_id': '1234567890abcdef',
        'browser.web_vital.lcp.value': 1250,
        'browser.web_vital.lcp.element': 'Private element',
        'url.full': 'https://example.com/?token=private',
    });
    assert.deepEqual(attributes, {
        'sentry.op': 'ui.webvital.lcp',
        'sentry.pageload.span_id': '1234567890abcdef',
        'browser.web_vital.lcp.value': 1250,
    });

    const transaction = scrubSentryTransaction({
        transaction: 'event/player@example.com',
        request: { data: 'private player profile' },
        contexts: { trace: { trace_id: 'active-trace', op: 'navigation', data: { 'route.key': 'private route key' } } },
        spans: [{ description: 'POST https://example.com/?token=private', data: { 'http.status_code': 200, 'url.query': 'token=private' } }],
        measurements: { app_start_cold: { value: 950, unit: 'millisecond' }, frames_slow: { value: 12, unit: 'none' }, private_measure: { value: 1 } },
    }, 'event/[id]');
    assert.equal(transaction.transaction, 'event/[id]');
    assert.equal(transaction.contexts.trace.trace_id, 'active-trace');
    assert.deepEqual(transaction.contexts.trace.data, {});
    assert.deepEqual(transaction.spans[0].data, { 'http.status_code': 200 });
    assert.equal(transaction.spans[0].description, undefined);
    assert.equal(transaction.request, undefined);
    assert.deepEqual(transaction.measurements, { app_start_cold: { value: 950, unit: 'millisecond' }, frames_slow: { value: 12, unit: 'none' } });
});

test('Sentry keeps symbolic frames and strips request, account, context, and URL data', () => {
    const event = scrubSentryEvent({
        user: { email: 'private@example.com' },
        request: { url: 'https://example.com/?token=secret' },
        tags: { flow: 'checkout', another: 'private@example.com' },
        contexts: { app: { app_build: '400', app_identifier: 'detail' }, trace: { trace_id: 'id' } },
        breadcrumbs: [{ message: 'Private player name' }],
        exception: { values: [{ value: 'Lookup for private@example.com at https://example.com/?token=secret',
            stacktrace: { frames: [{ filename: 'app:///assets/file.js?secret', lineno: 45, vars: { token: 'secret' } }] } }] },
    });
    assert.equal(event.user, undefined);
    assert.equal(event.request, undefined);
    assert.equal(event.breadcrumbs, undefined);
    assert.deepEqual(event.tags, { flow: 'checkout' });
    assert.deepEqual(event.contexts, { app: { app_build: '400' } });
    assert.equal(event.exception.values[0].value, 'Lookup for [email] at [url]');
    assert.deepEqual(event.exception.values[0].stacktrace.frames[0].filename, 'app:///assets/file.js');
    assert.equal(event.exception.values[0].stacktrace.frames[0].lineno, 45);
    assert.equal(event.exception.values[0].stacktrace.frames[0].vars, undefined);
});
