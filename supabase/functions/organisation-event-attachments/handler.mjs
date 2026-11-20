import { attachmentKinds, detectAttachment, maximumAttachmentBytes } from './media.mjs';

export const attachmentBucket = 'organisation-event-attachments';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const organisationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const json = (status, value) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const denied = () => json(403, { message: 'Current owner or admin access to this event and its organisation is required.' });

export function createAttachmentHandler({ createClient, url, key, serviceKey, uuid = () => crypto.randomUUID() }) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json(405, { message: 'Use POST to upload an event attachment.' });
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return json(401, { message: 'Sign in before uploading an event attachment.' });
    if (!url || !key || !serviceKey) return json(503, { message: 'Event attachments are temporarily unavailable.' });

    try {
      const actor = createClient(url, key, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: auth, error: authError } = await actor.auth.getUser(token);
      if (authError || !auth?.user?.id) return json(401, { message: 'Sign in again before uploading an event attachment.' });
      if (Number(request.headers.get('content-length')) > maximumAttachmentBytes + 65536) return json(413, { message: 'Choose a file up to 10 MB.' });
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
        return json(400, { message: 'Choose an event attachment to upload.' });
      }
      let bodyBytes = 0;
      let oversized = false;
      const stream = request.body?.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          bodyBytes += chunk.byteLength;
          if (bodyBytes > maximumAttachmentBytes + 65536) {
            oversized = true;
            controller.error(new RangeError('Attachment too large'));
          } else controller.enqueue(chunk);
        },
      }));
      const form = await new Response(stream, { headers: { 'Content-Type': request.headers.get('content-type') } })
        .formData().catch(() => null);
      if (oversized) return json(413, { message: 'Choose a file up to 10 MB.' });
      const org = form?.get('organisation_id');
      const id = form?.get('event_id');
      const kind = form?.get('kind');
      const file = form?.get('file');
      if (typeof org !== 'string' || !organisationId.test(org) || typeof kind !== 'string' || !Object.hasOwn(attachmentKinds, kind)
        || (id !== null && (typeof id !== 'string' || !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))))
        || !(file instanceof Blob) || file.size === 0) return json(400, { message: 'Choose a valid organisation, event and file.' });
      if (file.size > maximumAttachmentBytes) return json(413, { message: 'Choose a file up to 10 MB.' });

      const { data: capability, error: accessError } = await actor.rpc('admin_organisation_host_builder', {
        p_organisation_id: org, ...(id ? { p_event_id: Number(id) } : {}),
      });
      if (accessError || capability?.organisation?.id !== org || capability.organisation.status !== 'approved'
        || String(capability.event_id ?? '') !== (id ?? '')) return denied();

      const bytes = new Uint8Array(await file.arrayBuffer());
      const media = detectAttachment(bytes, kind);
      if (!media) return json(415, { message: 'This file type does not match the selected attachment.' });
      const destination = id ? `organisations/${org}/events/${id}` : `organisations/${org}/drafts`;
      const path = `${destination}/${kind}/${uuid()}.${media.extension}`;
      const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const bucket = service.storage.from(attachmentBucket);
      const { error: uploadError } = await bucket.upload(path, bytes, { contentType: media.contentType, upsert: false });
      if (uploadError) return json(502, { message: 'The attachment upload could not be confirmed.' });
      const publicUrl = bucket.getPublicUrl(path).data?.publicUrl;
      if (!publicUrl) return json(502, { message: 'The uploaded attachment link could not be confirmed.' });
      return json(201, { organisationId: org, eventId: id ? Number(id) : null, kind, contentType: media.contentType, url: publicUrl });
    } catch {
      return json(502, { message: 'The event attachment could not be uploaded. Please try again.' });
    }
  };
}
