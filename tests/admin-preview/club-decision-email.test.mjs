import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderClubDecisionEmail } from '../../supabase/functions/_shared/clubDecisionEmail.js';

const templates = ['club_approved', 'club_rejected', 'club_claim_approved', 'club_claim_rejected'];
// Evaluate only source brand markup and four static cases, never its edge server.
const source = readFileSync(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8');
const wrapper = source.slice(source.indexOf('function wrapBrandTemplate('), source.indexOf('// Generate a premium event information panel/card'))
  .replace(/function wrapBrandTemplate\([\s\S]*?\) \{/, 'function wrapBrandTemplate(contentHtml, titleText, actionUrl, actionLabel, options) {');
const cases = templates.map(template => {
  const start = source.indexOf(`    case '${template}':`);
  return source.slice(start, source.indexOf("\n    case '", start + 10));
}).join('\n');
const baseline = new Function('template', 'vars', `const SITE_URL='https://4mpadel.co.za'; const EMAIL_LOGO_URL=SITE_URL+'/images/4m-padel-event-management-logo.png'; const EMAIL_CLUBS_LOGO_URL=SITE_URL+'/images/4m-padel-clubs-logo.png'; ${wrapper} let subject='',contentHtml='',actionUrl='',actionLabel=''; switch(template){${cases}} return {subject,html:wrapBrandTemplate(contentHtml,subject,actionUrl,actionLabel,{logoUrl:EMAIL_CLUBS_LOGO_URL,logoAlt:'4M Padel Clubs'})};`);

test('all four templates preserve current email copy, brand, actions and subjects', () => {
  for (const template of templates) {
    const vars = { clubName: 'Example Padel', notes: 'Please supply venue details.' };
    assert.deepEqual(renderClubDecisionEmail(template, vars), baseline(template, vars));
  }
});
test('missing values retain source fallback copy', () => {
  for (const template of templates) assert.deepEqual(renderClubDecisionEmail(template), baseline(template, { clubName: '', notes: '' }));
});
test('dynamic markup is escaped including subject in HTML title, subject remains plain text', () => {
  const clubName = '<script>alert("x")</script> & Club';
  for (const template of templates) {
    const { subject, html } = renderClubDecisionEmail(template, { clubName, notes: '<img src=x onerror=alert(1)> & "Note"' });
    assert(!html.includes('<script>')); assert(!html.includes('<img src=x'));
    assert(html.includes('&lt;script&gt;')); assert(html.includes('&amp; Club'));
    if (template.endsWith('rejected')) assert(html.includes('&lt;img src=x'));
    if (template.startsWith('club_claim')) { assert(subject.includes(clubName)); assert(!subject.includes('&lt;')); }
  }
});
test('unsupported templates and non-text variables are rejected without mutation', () => {
  assert.throws(() => renderClubDecisionEmail('broadcast'), /Unsupported/);
  assert.throws(() => renderClubDecisionEmail('club_approved', { clubName: {} }), /text/);
  const input = Object.freeze({ clubName: 'Club', notes: 'Review', eventId: 'ignored' });
  assert.equal(typeof renderClubDecisionEmail('club_approved', input).html, 'string');
});
