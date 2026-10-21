import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAccessCode, getAccessCodeError, saveEventAccessCode } from '../src/utils/eventAccessCode.js';

const mockClient = (error = null) => {
    const calls = [];
    return { calls, rpc: async (...args) => { calls.push(args); return { error }; } };
};

test('generated codes use eight unambiguous characters', () => {
    for (let i = 0; i < 20; i += 1) assert.match(generateAccessCode(), /^[A-HJ-NP-Z2-9]{8}$/);
});

test('new protection requires a code between 6 and 64 characters after trimming', () => {
    for (const code of ['', '     ', '12345', 'x'.repeat(65)]) {
        assert.ok(getAccessCodeError({ enabled: true, code }));
    }
    for (const code of ['123456', '  AbCd12  ', 'x'.repeat(64), '🎾'.repeat(6)]) {
        assert.equal(getAccessCodeError({ enabled: true, code }), '');
    }
});

test('existing protection permits a blank replacement but validates any new code', () => {
    assert.equal(getAccessCodeError({ enabled: true, code: ' ', protectedBefore: true }), '');
    assert.ok(getAccessCodeError({ enabled: true, code: 'short', protectedBefore: true }));
    assert.equal(getAccessCodeError({ enabled: false, code: 'short' }), '');
});

test('enabling protection sends the trimmed, case-sensitive code only to the secure RPC', async () => {
    const client = mockClient();
    assert.equal(await saveEventAccessCode(client, 42, { enabled: true, code: '  AbCd12  ' }), 'code');
    assert.deepEqual(client.calls, [['set_event_access_code', { p_event_id: 42, p_enabled: true, p_code: 'AbCd12' }]]);
});

test('saving without a replacement preserves the code and existing player grants', async () => {
    const client = mockClient();
    assert.equal(await saveEventAccessCode(client, 42, { enabled: true, code: '', protectedBefore: true }), 'code');
    assert.deepEqual(client.calls, []);
});

test('replacing a saved code calls the secure RPC', async () => {
    const client = mockClient();
    await saveEventAccessCode(client, 42, { enabled: true, code: 'NewCode8', protectedBefore: true });
    assert.equal(client.calls[0][1].p_code, 'NewCode8');
});

test('disabling protection removes it through the secure RPC', async () => {
    const client = mockClient();
    assert.equal(await saveEventAccessCode(client, 42, { enabled: false, code: 'OldCode8', protectedBefore: true }), 'public');
    assert.deepEqual(client.calls, [['set_event_access_code', { p_event_id: 42, p_enabled: false, p_code: null }]]);
});

test('public events do not send unused codes or change access settings', async () => {
    const client = mockClient();
    await saveEventAccessCode(client, 42, { enabled: false, code: 'UnusedCode8' });
    assert.deepEqual(client.calls, []);
});

test('invalid codes do not reach the server', async () => {
    const client = mockClient();
    await assert.rejects(saveEventAccessCode(client, 42, { enabled: true, code: 'short' }), /6–64/);
    assert.deepEqual(client.calls, []);
});

test('RPC errors prevent a successful save result', async () => {
    const error = new Error('Access settings could not be saved');
    await assert.rejects(saveEventAccessCode(mockClient(error), 42, { enabled: true, code: 'ValidCode8' }), error);
});
