import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
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

test('registration reports retain their step, safe cause, and save status through the Sentry privacy filter', async () => {
    const bundle = await build({
        entryPoints: [fileURLToPath(new URL('../src/lib/web-monitoring.js', import.meta.url))],
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'cjs',
        write: false,
        define: { 'import.meta.env': '{"VITE_SENTRY_DSN":"local-fixture"}' },
    });
    const reports = [];
    let beforeSend;
    const sdk = {
        init: options => { beforeSend = options.beforeSend; },
        reactRouterV7BrowserTracingIntegration: () => ({}),
        withSentryReactRouterV7Routing: Routes => Routes,
        captureException(error, context) {
            const event = beforeSend({
                ...context,
                exception: { values: [{ value: error.message }] },
                user: { email: 'player@example.com' },
                request: { url: 'https://example.com/?token=private' },
            });
            reports.push(JSON.parse(JSON.stringify(event)));
        },
    };
    const module = { exports: {} };
    const requirePackage = createRequire(import.meta.url);
    runInNewContext(bundle.outputFiles[0].text, { module, require: name => name === '@sentry/react' ? sdk : requirePackage(name) });
    const { initializeWebMonitoring, reportRegistrationError } = module.exports;
    initializeWebMonitoring();

    reportRegistrationError({
        code: 'P0001', message: 'This event or division is full. No payment has been started.',
        details: 'Payer player@example.com, reference private-receipt',
    }, 'reserve_places', false);
    reportRegistrationError({
        name: 'FunctionsHttpError', code: 'private-receipt', context: { status: 502 }, message: 'player@example.com',
    }, 'update_schedule', true);
    reportRegistrationError({ name: 'player@example.com' }, 'private-step', false);

    assert.deepEqual(reports[0].tags, {
        flow: 'registration', platform: 'web', registration_step: 'reserve_places',
        entry_save_confirmed: 'unknown', backend_code: 'P0001', registration_problem: 'division_full',
    });
    assert.deepEqual(reports[1].tags, {
        flow: 'registration', platform: 'web', registration_step: 'update_schedule',
        entry_save_confirmed: 'yes', error_kind: 'FunctionsHttpError', http_status: '502',
    });
    assert.deepEqual(reports[2].tags, { flow: 'registration', platform: 'web' });
    assert.match(reports[0].exception.values[0].value, /reservation of division places \(division_full\)/);
    assert.match(reports[1].exception.values[0].value, /schedule update \(502\)/);
    assert.deepEqual(reports[0].fingerprint, ['4m-event-registration', 'reserve_places', 'division_full']);
    assert.deepEqual(reports[1].fingerprint, ['4m-event-registration', 'update_schedule', '502']);
    assert.doesNotMatch(JSON.stringify(reports), /player@example\.com|private-receipt|private-step|token=private/);
});
