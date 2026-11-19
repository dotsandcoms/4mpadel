import { supabase } from '../../supabaseClient';
import { useAccountSecurity } from '../../components/admin/useAccountSecurity';
import { CommunicationFeedback, CommunicationHeading } from './CommunicationControls';
import { communicationDate } from './communicationDate';
import PreviewAuthenticator, { FreshPreviewVerification } from './PreviewAuthenticator';

const verificationPurpose = {
  add: 'Verify to add a backup authenticator',
  remove: 'Verify to review removing this authenticator',
  recover: 'Verify to recover another administrator’s access',
};

function Authenticators({ state, actor, client }) {
  const { account, pending, code, setCode, name, setName, intent, setIntent, addReady, setAddReady, removeReady,
    setRemoveReady, busy, editing, enroll, verifyEnrollment, cancelEnrollment, freshVerified, remove } = state;

  return <section className="ap-section ap-comms-panel" aria-labelledby="current-authenticators">
    <h2 id="current-authenticators">Your authenticators</h2>
    <p className="ap-comms-subtext">Each connection belongs to {account.email} and works for banking, event messages and help requests.</p>
    {account.factors.length > 0 && <ul className="ap-comms-list">
      {account.factors.map(factor => <li className="ap-comms-inline-row" key={factor.id}>
        <div><strong>{factor.friendly_name || 'Authenticator app'}</strong>{factor.created_at && <small>Connected {communicationDate(factor.created_at)}</small>}</div>
        <button className="ap-secondary" type="button" disabled={editing} aria-label={`Remove ${factor.friendly_name || 'authenticator'}`} onClick={() => { setRemoveReady(null); setIntent({ kind: 'remove', factor }); }}>Remove</button>
      </li>)}
    </ul>}
    {!pending && !intent && !removeReady && (!account.factors.length || addReady) && <label className="ap-comms-field ap-comms-max-form">
      <span>Name this authenticator</span><input name="authenticator-name" autoComplete="off" maxLength={50} value={name} onChange={event => setName(event.target.value)} disabled={busy} />
    </label>}
    {(pending || !account.factors.length && !intent) && <PreviewAuthenticator accountEmail={account.email}
      factor={pending?.factor || ''} secret={pending?.secret || ''} qrCode={pending?.qrCode || ''} code={code} busy={busy}
      onSetup={enroll} onCode={setCode} onVerify={verifyEnrollment} onCancel={pending ? cancelEnrollment : undefined} showSecurityLink={false} />}
    {account.factors.length > 0 && !pending && !intent && !removeReady && <div className="ap-comms-actions">
      {addReady ? <>
        <button className="ap-primary" type="button" disabled={busy} onClick={enroll}>Show setup QR</button>
        <button className="ap-secondary" type="button" disabled={busy} onClick={() => setAddReady(false)}>Cancel</button>
      </> : <button className="ap-primary" type="button" disabled={editing} onClick={() => setIntent({ kind: 'add' })}>Add backup authenticator</button>}
    </div>}
    {intent && <FreshPreviewVerification client={client} actorId={actor.id} purpose={verificationPurpose[intent.kind]} onVerified={freshVerified} onCancel={() => setIntent(null)} />}
    {removeReady && <div className="ap-comms-review">
      <strong>Remove {removeReady.friendly_name || 'this authenticator'}?</strong>
      <p>{account.factors.length === 1 ? 'This is your last authenticator. You will need to set up a new one before using banking, event messages or help requests.' : 'Its codes will stop working. Your other connected authenticators remain available.'}</p>
      <div className="ap-comms-actions">
        <button className="ap-primary" type="button" onClick={remove} disabled={busy}>Remove authenticator</button>
        <button className="ap-secondary" type="button" onClick={() => setRemoveReady(null)} disabled={busy}>Keep authenticator</button>
      </div>
    </div>}
  </section>;
}

function Recovery({ state }) {
  const { account, editing, busy, setIntent, recoveryReady, email, changeEmail, lookup, target, selected,
    changeFactor, reason, changeReason, confirmed, changeConfirmation, review, setReview, reset, canReview, reviewReset, history, loadRecoveryHistory } = state;

  return <section className="ap-section ap-comms-panel" aria-labelledby="assisted-recovery">
    <h2 id="assisted-recovery">Help another administrator recover access</h2>
    <p className="ap-comms-subtext">Verify their identity directly before resetting a lost authenticator. Every reset records both accounts and your reason.</p>
    {!recoveryReady ? <div className="ap-comms-actions"><button className="ap-primary" type="button" disabled={editing || !account.factors.length} onClick={() => { setIntent({ kind: 'recover' }); setReview(false); }}>Verify to recover another account</button></div> : <>
      <form className="ap-comms-fields ap-comms-max-form" onSubmit={lookup}>
        <label className="ap-comms-field"><span>Administrator or organiser email</span>
          <input name="recovery-email" type="email" required autoComplete="off" maxLength={254} value={email} disabled={busy || review} onChange={event => changeEmail(event.target.value)} />
        </label><div className="ap-comms-actions"><button className="ap-secondary" type="submit" disabled={busy || review}>Find account</button></div>
      </form>
      {target && <div className="ap-comms-fields">
        <strong>{review ? 'Review reset for ' : 'Connected authenticators for '}{target.email}</strong>
        {!target.factors.length ? <p className="ap-comms-subtext">This account has no authenticator connections. They can sign in and set up an authenticator.</p> : <>
          <fieldset className="ap-comms-fields" disabled={busy || review}><legend>Select the connections they have lost</legend>
            {target.factors.map(factor => <label key={factor.id} className="ap-comms-check"><input type="checkbox" checked={selected.includes(factor.id)}
              onChange={event => changeFactor(factor.id, event.target.checked)} />
              <span>{factor.friendly_name || 'Authenticator app'} · {factor.status === 'verified' ? 'Connected' : 'Unfinished setup'}</span>
            </label>)}
          </fieldset>
          <label className="ap-comms-field"><span>How did you verify their identity?</span>
            <textarea name="recovery-reason" rows={3} minLength={20} maxLength={500} disabled={busy || review} value={reason} onChange={event => changeReason(event.target.value)} />
          </label>
          <label className="ap-comms-check"><input type="checkbox" checked={confirmed} disabled={busy || review} onChange={event => changeConfirmation(event.target.checked)} />
            <span>I verified this person’s identity outside this request and confirmed they need these connections reset.</span>
          </label>
          {review && <p className="ap-comms-notice">Resetting signs this person out of their existing sessions. They must sign in again and set up a new authenticator. Their account permissions stay in place.</p>}
          <div className="ap-comms-actions">{review ? <>
            <button className="ap-primary" type="button" onClick={reset} disabled={busy || !canReview}>{busy ? 'Resetting authenticators…' : 'Reset selected authenticators'}</button>
            <button className="ap-secondary" type="button" onClick={() => setReview(false)} disabled={busy}>Go back</button>
          </> : <button className="ap-primary" type="button" onClick={reviewReset} disabled={busy || !canReview}>Review reset</button>}</div>
        </>}
      </div>}
      <div className="ap-comms-actions"><button className="ap-secondary" type="button" disabled={busy} onClick={loadRecoveryHistory}>Refresh recovery history</button></div>
      {history && <div className="ap-comms-fields"><strong>Your recent recoveries</strong>{history.length ? <ul className="ap-comms-list">
        {history.map(row => <li key={row.id}>{row.target_email} · {row.state === 'completed' ? 'Completed' : row.state === 'failed' ? 'Needs another attempt' : 'Processing — check before retrying'}<br />
          <small>{communicationDate(row.created_at)}</small></li>)}
      </ul> : <p className="ap-comms-subtext">You have not started any account recoveries.</p>}</div>}
    </>}
    {!account.factors.length && <p className="ap-comms-notice">Set up your own authenticator first, or ask another verified Super Admin for help.</p>}
  </section>;
}

function Security({ actor, client, canRecover }) {
  const state = useAccountSecurity(actor.id);
  const { account, error, feedback, hidden } = state;
  return <section className="ap-communications" aria-label="Account security">
    <CommunicationHeading eyebrow="System" title="Security" description="Manage the authenticators connected to your account." />
    <CommunicationFeedback error={error} message={feedback} />
    {!account ? <p role="status">Loading authenticators…</p> : hidden ? <p className="ap-comms-notice">Account details hidden while this page is in the background.</p> : <>
      <Authenticators state={state} actor={actor} client={client} />
      {canRecover ? <Recovery state={state} /> : <p className="ap-comms-subtext">Lost access to all your authenticators? Ask a verified 4M Super Admin to recover this account or <a href="/contact">contact 4M support</a>.</p>}
    </>}
  </section>;
}

export default function AccountSecurityWorkspace({ client = supabase, session, permissions, targetEmail }) {
  const actor = session?.user;
  if (!actor?.id) return null;
  const ownAccount = actor.email && (!targetEmail || targetEmail.trim().toLowerCase() === actor.email.toLowerCase());
  return <Security key={`${actor.id}:${actor.email}`} actor={actor} client={client} canRecover={Boolean(ownAccount && permissions?.role === 'super_admin')} />;
}
