import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttachmentHandler } from '../supabase/functions/organisation-event-attachments/handler.mjs';
import { detectAttachment, maximumAttachmentBytes } from '../supabase/functions/organisation-event-attachments/media.mjs';
import { uploadOrganisationEventAttachment } from '../src/utils/organisationEventAttachments.js';

const organisation = '11111111-1111-1111-1111-111111111111';
const foreign = '22222222-2222-2222-2222-222222222222';
const bucket = 'organisation-event-attachments';
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR9sAAAAASUVORK5CYII=', 'base64');
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

function sampleZip(names) {
  const records = [], directory = [];
  let offset = 0;
  for (const name of names) {
    const utf8 = Buffer.from(name);
    const content = Buffer.from('fixture');
    const header = Buffer.alloc(30), central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(utf8.length, 26);
    header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22);
    central.writeUInt32LE(0x02014b50); central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24); central.writeUInt16LE(utf8.length, 28);
    central.writeUInt32LE(offset, 42);
    records.push(header, utf8, content);
    directory.push(central, utf8);
    offset += header.length + utf8.length + content.length;
  }
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50); footer.writeUInt16LE(names.length, 8); footer.writeUInt16LE(names.length, 10);
  footer.writeUInt32LE(directory.reduce((sum, block) => sum + block.length, 0), 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...directory, footer]);
}
function sampleLegacyWord(streamName) {
  const file = Buffer.alloc(1024);
  Buffer.from([208,207,17,224,161,177,26,225]).copy(file);
  file.writeUInt16LE(0xfffe, 28);
  file.writeUInt16LE(9, 30);
  const name = Buffer.from(streamName + '\u0000', 'utf16le');
  name.copy(file, 512);
  file.writeUInt16LE(name.length, 512 + 64);
  file[512 + 66] = 2;
  file.writeUInt32LE(0xfffffffe, 76);
  return file;
}

test('the server identifies actual raster, PDF and Word formats for each approved media field', () => {
  assert.deepEqual(detectAttachment(photo, 'sponsor'), { contentType: 'image/png', extension: 'png' });
  assert.deepEqual(detectAttachment(pdf, 'poster'), { contentType: 'application/pdf', extension: 'pdf' });
  assert.equal(detectAttachment(pdf, 'gallery'), null);
  assert.equal(detectAttachment(Buffer.from('<html>fake document</html>'), 'poster'), null);
  assert.equal(detectAttachment(Buffer.concat([photo, Buffer.from('extra bytes')]), 'sponsor'), null);
  assert.equal(detectAttachment(Buffer.alloc(maximumAttachmentBytes + 1), 'gallery'), null);
  assert.equal(detectAttachment(sampleZip(['[Content_Types].xml', 'word/document.xml']), 'organiser-kit').extension, 'docx');
  assert.equal(detectAttachment(sampleZip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin']), 'organiser-kit'), null);
  assert.equal(detectAttachment(sampleZip(['[Content_Types].xml', 'xl/workbook.xml']), 'organiser-kit'), null);
  assert.equal(detectAttachment(sampleLegacyWord('WordDocument'), 'organiser-kit').extension, 'doc');
  assert.equal(detectAttachment(sampleLegacyWord('Workbook'), 'organiser-kit'), null);
});

function makeRequest({ org = organisation, event = '41', kind = 'poster', bytes = pdf, name = 'renamed.html', type = 'text/html', auth = 'signed' } = {}) {
  const body = new FormData();
  body.set('organisation_id', org);
  if (event) body.set('event_id', event);
  body.set('kind', kind);
  body.set('file', new File([bytes], name, { type }));
  return new Request('https://edge.fixture.invalid/', { method: 'POST', headers: auth ? { authorization: 'Bearer ' + auth } : {}, body });
}

function fixture() {
  const uploads = [], checked = [];
  const handler = createAttachmentHandler({
    url:'https://storage.fixture.invalid', key:'anon', serviceKey:'service',
    uuid: () => 'a22b0451-e2da-4a84-bcb1-7d89af0598b4',
    createClient: (_url, key) => key === 'anon' ? {
      auth: { getUser: async token => token === 'signed' ? { data: { user: { id:'owner' } } } : {error:true} },
      rpc: async (name,args) => {
        checked.push([name,args]);
        if (args.p_organisation_id !== organisation || (args.p_event_id && args.p_event_id !== 41)) return {error:true};
        return { data: { organisation: { id: organisation, status: 'approved' }, event_id: args.p_event_id || null } };
      },
    } : {
      storage: { from: bucket => ({
        upload: async (path, bytes, options) => { uploads.push({bucket,path,bytes,options}); return {}; },
        getPublicUrl: path => ({data:{publicUrl:`https://storage.fixture.invalid/storage/v1/object/public/${bucket}/${path}`}}),
      }) },
    },
  });
  return { handler, uploads, checked };
}

test('the upload handler determines storage scope and MIME independent of browser names and types', async () => {
  const { handler, uploads, checked } = fixture();
  const response = await handler(makeRequest());
  assert.equal(response.status, 201);
  const attachment = await response.json();
  assert.deepEqual(checked, [['admin_organisation_host_builder', { p_organisation_id: organisation, p_event_id: 41 }]]);
  assert.equal(uploads[0].bucket, bucket);
  assert.match(uploads[0].path, new RegExp(`^organisations/${organisation}/events/41/poster/[0-9a-f-]+\\.pdf$`));
  assert.deepEqual(uploads[0].options, { upsert: false, contentType: 'application/pdf' });
  assert.equal(attachment.contentType, 'application/pdf');
  assert.ok(attachment.url.endsWith(uploads[0].path));

  const draft = await handler(makeRequest({ event: null, kind: 'sponsor', bytes: photo }));
  assert.equal(draft.status, 201);
  assert.equal((await draft.json()).eventId, null);
  assert.match(uploads[1].path, new RegExp(`^organisations/${organisation}/drafts/sponsor/[0-9a-f-]+\\.png$`));
});

test('unowned, anonymous, malformed, oversized and incorrectly typed requests never reach storage', async () => {
  const { handler, uploads } = fixture();
  const rejected = [
    [401, { auth: '' }], [401, { auth: 'bad' }],
    [403, { org: foreign }], [403, { event: '42' }],
    [400, { event: '0' }], [400, { kind: '../../file' }],
    [415, { bytes: Buffer.from('<script>type mismatch</script>'), type: 'application/pdf' }],
    [415, { bytes: pdf, kind: 'sponsor' }],
    [413, { bytes: Buffer.alloc(maximumAttachmentBytes + 1) }],
  ];
  for (const [status, overrides] of rejected) assert.equal((await handler(makeRequest(overrides))).status, status);
  assert.equal(uploads.length, 0);
});

test('the browser checks the event-bound receipt and rechecks the current workspace before attaching it', async () => {
  const requestLog = [];
  const fakeReceipt = {
    organisationId: organisation, eventId: 41, kind: 'poster', contentType: 'application/pdf',
    url: `https://storage.fixture.invalid/storage/v1/object/public/${bucket}/organisations/${organisation}/events/41/poster/sample.pdf`,
  };
  const client = { functions: { invoke: async (name, { body }) => {
    requestLog.push([name, body.get('organisation_id'), body.get('event_id'), body.get('kind')]);
    return { data: fakeReceipt };
  } } };
  const options = { client, organisationId: organisation, eventId: 41, kind: 'poster', file:new File([pdf], 'test.pdf'),
    checkpoint: async () => requestLog.push('current') };
  assert.deepEqual(await uploadOrganisationEventAttachment(options), { url: fakeReceipt.url, contentType: fakeReceipt.contentType });
  assert.deepEqual(requestLog, ['current',['organisation-event-attachments',organisation,'41','poster'],'current']);
  fakeReceipt.url = fakeReceipt.url.replace('/events/41/', '/events/42/');
  await assert.rejects(uploadOrganisationEventAttachment(options), /link could not be verified/);
  await assert.rejects(uploadOrganisationEventAttachment({ ...options, client: { functions: { invoke: async () => ({
    error: { context: new Response(JSON.stringify({ message: 'Permission was revoked.' }), { status: 403 }) },
  }) } } }), /Permission was revoked/);
});
