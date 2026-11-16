const messages = {
  RECOVERY_SIGN_IN: 'Sign in again before recovering an account.',
  RECOVERY_SUPER_ADMIN_REQUIRED: 'Only a verified Super Admin can recover another account.',
  RECOVERY_MFA_REQUIRED: 'Verify a fresh authenticator code and try again.',
  RECOVERY_INVALID_EMAIL: 'Enter a valid administrator or organiser email.',
  RECOVERY_STAFF_UNAVAILABLE: 'This administrator or organiser account is unavailable.',
  RECOVERY_USE_OWN_SETTINGS: 'Use your own authenticator settings to change this account.',
  RECOVERY_CONFIRM_IDENTITY: 'Confirm that you verified this person’s identity outside this request.',
  RECOVERY_REASON_REQUIRED: 'Explain how you verified their identity using 20 to 500 characters.',
  RECOVERY_RETRY_CHANGED: 'This recovery retry has different details. Look up the account again.',
  RECOVERY_FACTORS_CHANGED: 'The connected authenticators changed. Look up the account again.',
  RECOVERY_IN_PROGRESS: 'Another recovery is in progress. Wait before trying again.',
  RECOVERY_RATE_LIMIT: 'Too many recovery requests. Try again in an hour.',
};
const allowedOrigins = new Set(['https://4mpadel.co.za', 'https://www.4mpadel.co.za']);
/** @param {{createClient: Function, url: string, key: string, serviceKey: string, reportError?: (stage: string, reference?: string) => void}} dependencies */
export function createRecoveryHandler({ createClient, url, key, serviceKey, reportError = () => {} }) {
  return async request => {
    const origin = request.headers.get('origin');
    const cors = { Vary: 'Origin', ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (origin && !allowedOrigins.has(origin)) return reply(403, { error: 'RECOVERY_ORIGIN', message: 'Open the published 4M Admin website to recover an account.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'RECOVERY_METHOD', message: 'Use POST.' });
    const bearer = request.headers.get('authorization');
    if (!bearer?.match(/^Bearer \S+$/i)) return reply(401, { error: 'RECOVERY_SIGN_IN', message: messages.RECOVERY_SIGN_IN });
    if (!url || !key || !serviceKey) return reply(503, { error: 'RECOVERY_UNAVAILABLE', message: 'Account recovery is temporarily unavailable.' });
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 4000) return reply(413, { error: 'RECOVERY_INVALID_REQUEST', message: 'Recovery request is too large.' });
      body = JSON.parse(raw);
      if (!body || Array.isArray(body) || !['lookup', 'reset', 'history'].includes(body.action)) throw new Error();
    } catch { return reply(400, { error: 'RECOVERY_INVALID_REQUEST', message: 'Choose a recovery action.' }); }
    const caller = createClient(url, key, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false, autoRefreshToken: false } });
    try {
      const identity = await caller.auth.getUser(bearer.replace(/^Bearer /i, ''));
      if (identity.error || !identity.data?.user) return reply(401, { error: 'RECOVERY_SIGN_IN', message: messages.RECOVERY_SIGN_IN });
      const { action, ...payload } = body;
      const authorised = await caller.rpc('authenticator_recovery_action', { p_action: action === 'reset' ? 'prepare' : action, p_data: payload });
      if (authorised.error) {
        const code = authorised.error.message;
        return reply(code === 'RECOVERY_SIGN_IN' ? 401 : 403, { error: messages[code] ? code : 'RECOVERY_INVALID_REQUEST', message: messages[code] || 'Recovery could not be authorised. Check the account and try again.' });
      }
      if (action !== 'reset' || !authorised.data?.execute) return reply(200, authorised.data);
      const approval = authorised.data;
      if (!approval.userId || !Array.isArray(approval.factorIds) || !approval.factorIds.length || !approval.requestId) throw new Error('Invalid approval');
      // The service credential is constructed only after the caller/session,
      // actual Super Admin role, recent TOTP and exact factor snapshot pass SQL.
      const worker = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const removed = [];
      let succeeded = true;
      for (const id of approval.factorIds) {
        try {
          const result = await worker.auth.admin.mfa.deleteFactor({ userId: approval.userId, id });
          if (result.error) { succeeded = false; break; }
          removed.push(id);
        } catch { succeeded = false; break; }
      }
      const saved = await worker.rpc('finish_authenticator_recovery', { p_request: approval.requestId, p_removed: removed, p_success: succeeded });
      if (saved.error) {
        reportError('recovery_audit_finish', approval.requestId);
        return reply(503, { error: 'RECOVERY_REVIEW_REQUIRED', requestId: approval.requestId, message: 'The recovery result needs review. Check its history before trying again.' });
      }
      return reply(succeeded ? 200 : 502, { requestId: approval.requestId, state: succeeded ? 'completed' : 'failed', removedCount: removed.length,
        ...(succeeded ? {} : { error: 'RECOVERY_PARTIAL', message: 'Recovery could not finish. Look up the account again to check the remaining authenticators.' }) });
    } catch {
      reportError('recovery_unavailable');
      return reply(503, { error: 'RECOVERY_UNAVAILABLE', message: 'Account recovery is temporarily unavailable. Check its history before retrying a reset.' });
    }
  };
}
