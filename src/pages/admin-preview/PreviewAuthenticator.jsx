import { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import SearchableDropdown from '../../components/SearchableDropdown';
import { authenticatorQrSource } from '../../utils/messagingAuthenticator';
import './CommunicationsWorkspace.css';

export default function PreviewAuthenticator({
  accountEmail, factor, factors = [], secret, qrCode, code, busy,
  onSetup, onFactorChange, onCode, onVerify, onCancel, purpose, showSecurityLink = true,
}) {
  const qr = authenticatorQrSource(qrCode);
  const connected = factors.find(item => item.id === factor);
  return (
    <section className="ap-section ap-comms-panel ap-comms-factor" aria-label="Authenticator verification">
      <div className="ap-comms-title">
        <p className="ap-kicker">Account security</p>
        <h2>{purpose || (secret || !factor ? 'Set up an authenticator' : 'Verify your authenticator')}</h2>
      </div>
      {accountEmail && <p className="ap-comms-subtext">Signed in as <strong>{accountEmail}</strong>.</p>}
      {!factor && onSetup && <p className="ap-comms-subtext">Use an authenticator app such as Google Authenticator or Microsoft Authenticator. Set it up here, then scan the QR code and enter its six-digit code.</p>}
      {!factor && !onSetup && <p className="ap-comms-subtext">Set up a connected authenticator in Security before continuing.</p>}
      {connected && factors.length < 2 && <p className="ap-comms-subtext">Connected authenticator: <strong>{connected.friendly_name || 'Authenticator app'}</strong>.</p>}
      {factors.length > 1 && <label className="ap-comms-field ap-comms-max-form"><span>Choose your connected authenticator</span>
        <SearchableDropdown value={factor} disabled={busy} onChange={event => onFactorChange(event.target.value)}>
          {factors.map(item => <option key={item.id} value={item.id}>{item.friendly_name || 'Authenticator app'}</option>)}
        </SearchableDropdown>
      </label>}
      {secret && <>
        <p>Scan the QR code with your authenticator app, then use the six-digit code it generates.</p>
        {qr && <img src={qr} alt="Authenticator setup QR code" width="192" height="192" />}
        <details open={!qr}><summary>Enter a setup key instead</summary><p>In your authenticator app, add a time-based account and enter this key. Keep the key private.</p><code>{secret}</code></details>
      </>}
      {!factor && onSetup && <div className="ap-comms-actions"><button type="button" className="ap-primary" disabled={busy} onClick={onSetup}><KeyRound size={15} aria-hidden="true" />Set up authenticator</button></div>}
      {factor && <form className="ap-comms-fields ap-comms-max-form" onSubmit={event => { event.preventDefault(); if (!busy && /^\d{6}$/.test(code)) onVerify(); }}>
        <label className="ap-comms-field"><span>Six-digit authenticator code</span><input name="messaging-authenticator-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required disabled={busy} onChange={event => onCode(event.target.value.replace(/\D/g, '').slice(0,6))} /></label>
        <div className="ap-comms-actions"><button className="ap-primary" disabled={busy || !/^\d{6}$/.test(code)}>Verify code</button></div>
      </form>}
      <div className="ap-comms-actions">
        {onCancel && <button type="button" className="ap-secondary" onClick={onCancel} disabled={busy}>Cancel</button>}
        {showSecurityLink && <Link className="ap-text-button" to="/admin-preview/security">Manage authenticators and backup access</Link>}
      </div>
      {!secret && <details><summary>Can’t find your code?</summary><p>Use the phone or app that you connected to this account. If it is unavailable, <a href="/contact" target="_blank" rel="noopener noreferrer">contact 4M support</a>.</p></details>}
    </section>
  );
}

export function FreshPreviewVerification({ client, actorId, purpose, onVerified, onCancel, allowEnrollment = false }) {
  const [factors, setFactors] = useState(null);
  const [factor, setFactor] = useState('');
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false), pending = useRef(null), working = useRef(false);

  useEffect(() => {
    active.current = true;
    client.auth.mfa.listFactors().then(({ data, error: issue }) => {
      if (!active.current) return;
      if (issue) { setError('Could not load authenticators. Sign in again and retry.'); return; }
      const connected = (data?.totp || []).filter(item => item.status === 'verified');
      setFactors(connected);
      setFactor(connected[0]?.id || '');
    }).catch(() => { if (active.current) setError('Could not load authenticators. Sign in again and retry.'); });
    return () => {
      active.current = false;
      const factorId = pending.current;
      pending.current = null;
      if (factorId) {
        void client.auth.getUser().then(({ data }) => {
          if (data?.user?.id === actorId) return client.auth.mfa.unenroll({ factorId });
        }).catch(() => {});
      }
    };
  }, [actorId, client]);

  const run = async operation => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const { data, error: issue } = await client.auth.getUser();
      if (!active.current) return;
      if (issue || data?.user?.id !== actorId) throw new Error('Sign in again before verifying your authenticator.');
      await operation();
    } catch (issue) {
      if (active.current) setError(issue.message);
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  };
  const enroll = () => run(async () => {
    const result = await client.auth.mfa.enroll({ factorType: 'totp', issuer: '4M Padel', friendlyName: `4M Banking ${Date.now()}` });
    if (result.error) throw new Error('Could not set up an authenticator. Retry or contact 4M support.');
    if (!active.current) {
      const { data } = await client.auth.getUser();
      if (data?.user?.id === actorId) await client.auth.mfa.unenroll({ factorId: result.data.id });
      return;
    }
    pending.current = result.data.id;
    setFactor(result.data.id);
    setEnrollment(result.data.totp);
  });
  const verify = () => run(async () => {
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor, code });
    if (verified.error) throw new Error('Code could not be verified. Use the latest code and try again.');
    pending.current = null;
    if (!active.current) return;
    setCode('');
    setEnrollment(null);
    await onVerified();
  });

  return <>
    {error && <p className="ap-comms-error" role="alert">{error}</p>}
    {factors ? <PreviewAuthenticator factor={factor} factors={factors} secret={enrollment?.secret} qrCode={enrollment?.qr_code}
      code={code} busy={busy} purpose={purpose} showSecurityLink={false} onSetup={allowEnrollment ? enroll : undefined}
      onFactorChange={id => { setFactor(id); setCode(''); setError(''); }} onCode={setCode} onVerify={verify} onCancel={onCancel} />
      : <div className="ap-comms-panel">{!error && <p role="status">Loading authenticators…</p>}<button className="ap-secondary" type="button" onClick={onCancel}>Cancel</button></div>}
  </>;
}
