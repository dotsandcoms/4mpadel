import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

// Exercise the actual edge template without starting its HTTP server or sending mail.
const source = await readFile(new URL('../supabase/functions/send-email/index.ts', import.meta.url), 'utf8');
const templateSource = source.slice(0, source.indexOf('serve(async (req: Request)'))
    .replace(/^import .*;\n/gm, '') + '\nexport { generateEmailBody, ADMIN_ONLY_TEMPLATES };';
const { code } = await transform(templateSource, { loader: 'ts', format: 'esm' });
const { generateEmailBody, ADMIN_ONLY_TEMPLATES } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

for (const payment_method of ['platform', 'eft', 'external']) {
    test(`comp confirmation waives fees and excludes payment instructions for ${payment_method}`, async () => {
        const event = { id: 42, event_name: 'adidas Padel Tour', venue: 'Epicentre', city: 'Cape Town', event_dates: '22–25 October 2026', payment_method, external_payment_url: 'https://example.com/pay' };
        const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: event }) }) }) }) };
        const result = await generateEmailBody(client, 'entry_comped', {
            eventId: 42, playerName: 'Jess Brown', division: 'Ladies Open', partnerName: 'TBD',
            paid: false, amountDue: 'R 800', amount: 'R 800', payUrl: 'https://example.com/pay',
        });
        assert.equal(result.subject, 'Complimentary Entry Confirmed: adidas Padel Tour');
        for (const text of ['Jess Brown', 'Ladies Open', 'Epicentre', '22–25 October 2026', 'Complimentary Entry', 'R 0.00', 'View Event Details']) assert.ok(result.html.includes(text), text);
        assert.doesNotMatch(result.html, /R 800|Payment Pending|Pay Entry Fee|Complete Payment|EFT payment details|https:\/\/example.com\/pay/);
        assert.match(result.html, /https:\/\/4mpadel.co.za\/calendar\/42/);
    });
}

test('comp notices require admin authorization', () => {
    assert.ok(ADMIN_ONLY_TEMPLATES.has('entry_comped'));
});
