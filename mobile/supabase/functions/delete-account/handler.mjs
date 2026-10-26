const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const respond = (status, body) => new Response(JSON.stringify(body), { status, headers });

/** The caller's verified Auth identity is the only deletion target. */
export function createDeletionHandler({ admin, revokeApple }) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers });
    if (request.method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' });
    const bearer = request.headers.get('authorization');
    if (!bearer?.match(/^Bearer \S+$/i)) return respond(401, { error: 'UNAUTHORIZED' });
    try {
      const text = await request.text();
      if (text.length > 8192) return respond(413, { error: 'REQUEST_TOO_LARGE' });
      let body;
      try { body = JSON.parse(text); } catch { return respond(400, { error: 'INVALID_REQUEST' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).some(key => !['confirmation', 'appleAuthorizationCode'].includes(key)) ||
          body.confirmation !== 'DELETE') return respond(400, { error: 'CONFIRMATION_REQUIRED' });

      const { data: { user }, error: authError } = await admin.auth.getUser(bearer.slice(7));
      if (authError || !user?.id || !user.email) return respond(401, { error: 'UNAUTHORIZED' });
      const apple = user.identities?.find(identity => identity.provider === 'apple');
      if (apple) {
        if (typeof body.appleAuthorizationCode !== 'string' || !body.appleAuthorizationCode.trim()) {
          return respond(400, { error: 'APPLE_REAUTHENTICATION_REQUIRED' });
        }
        await revokeApple(body.appleAuthorizationCode, apple.identity_data?.sub);
      }
      const { data: objects, error: storageError } = await admin.rpc('account_deletion_storage', { p_user_id: user.id });
      if (storageError || !Array.isArray(objects)) throw new Error('STORAGE_LOOKUP_FAILED');
      const buckets = new Map();
      for (const object of objects) {
        if (!buckets.has(object.bucket)) buckets.set(object.bucket, []);
        buckets.get(object.bucket).push(object.name);
      }
      for (const [bucket, names] of buckets) {
        for (let i = 0; i < names.length; i += 100) {
          const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
          if (error) throw new Error('PHOTO_REMOVAL_FAILED');
        }
      }
      const { data: deleted, error } = await admin.rpc('complete_account_deletion', { p_user_id: user.id });
      if (error || deleted !== true) throw new Error('ACCOUNT_REMOVAL_FAILED');
      return respond(200, { deleted: true });
    } catch (error) {
      // Never return database messages, tokens, emails or provider responses.
      const code = error?.message === 'APPLE_REVOCATION_NOT_CONFIGURED'
        ? 'APPLE_REVOCATION_NOT_CONFIGURED' : 'DELETION_FAILED';
      return respond(503, { error: code });
    }
  };
}
