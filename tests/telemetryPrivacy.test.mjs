import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsIdentityInput, posthogHost, scrubSentryEvent } from '../mobile/src/lib/telemetry-privacy.js';

test('web and mobile hash the same account input and reject non-account identifiers', () => {
    const id = 'ABB30000-B500-41EA-8FA3-EAA71004FA20';
    assert.equal(analyticsIdentityInput(id), '4m:analytics:v1:user:' + id.toLowerCase());
    assert.equal(analyticsIdentityInput('private@example.com'), null);
    assert.equal(analyticsIdentityInput(null), null);
    assert.equal(posthogHost('https://us.i.posthog.com'), 'https://us.i.posthog.com');
    assert.equal(posthogHost('https://example.com'), 'https://eu.i.posthog.com');
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
