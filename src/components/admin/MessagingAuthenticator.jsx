import React, { useId } from 'react';
import { authenticatorQrSource } from '../../utils/messagingAuthenticator';

/** Short, state-specific guidance using the existing event-messaging form styles. */
export default function MessagingAuthenticator({ accountEmail, factor, factors = [], secret, qrCode, code, busy, onSetup, onFactorChange, onCode, onVerify, buttonClass, fieldClass }) {
    const hintId = useId();
    const settingUp = !factor || !!secret;
    const qr = secret ? authenticatorQrSource(qrCode) : null;
    const connected = factors.find(item => item.id === factor);
    const connectedDate = connected?.created_at && !Number.isNaN(Date.parse(connected.created_at)) ? new Date(connected.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6 space-y-5">
        <div className="space-y-2 max-w-2xl">
            <h3 className="font-semibold">{settingUp ? 'Set up your authenticator' : 'Verify with your authenticator'}</h3>
            <p className="text-sm leading-6 text-gray-400">This extra check protects event messages and player information.</p>
            {accountEmail && <p className="text-sm leading-6 text-gray-300">Signed in as <strong className="font-semibold text-white break-all">{accountEmail}</strong></p>}
            <p className="text-sm leading-6 text-gray-400">Each login email needs its own setup. You can keep multiple accounts in the same authenticator app; choose the entry for the email shown here.</p>
            <p className="text-sm leading-6 text-gray-300">One authenticator setup covers banking, event messages and help requests for this email.</p>
            {settingUp && <p className="text-sm leading-6 text-gray-300">Your authenticator app generates the 6-digit code after you add this account using its QR code or setup key.</p>}
        </div>
        {!settingUp && connected && <div className="max-w-xl space-y-2 text-sm leading-6 text-gray-300">
            {factors.length > 1 ? <label className="block">Choose your connected authenticator
                <select className={`${fieldClass} mt-2 block`} value={factor} disabled={busy} onChange={event => onFactorChange(event.target.value)}>{factors.map(item => <option key={item.id} value={item.id}>{item.friendly_name || 'Authenticator'}</option>)}</select>
            </label> : <p>Connected authenticator: <strong className="font-semibold text-white break-all">{connected.friendly_name || 'Authenticator app'}</strong></p>}
            {connectedDate && <p className="text-gray-400">Connected {connectedDate}</p>}
        </div>}
        <ol className="list-decimal pl-5 space-y-3 text-sm leading-6 text-gray-300 max-w-2xl marker:text-gray-500">
            {settingUp ? <>
                <li>Open an authenticator app on your phone. If you need one, install <strong className="font-semibold text-white">Google Authenticator</strong> or <strong className="font-semibold text-white">Microsoft Authenticator</strong> from your phone’s app store.</li>
                <li>{secret ? <>In the app, tap <strong className="font-semibold text-white">+</strong> or <strong className="font-semibold text-white">Add account</strong>, then scan the QR code below.</> : <>Select <strong className="font-semibold text-white">Set up authenticator</strong> below. Then use <strong className="font-semibold text-white">+</strong> or <strong className="font-semibold text-white">Add account</strong> in your authenticator app to scan the QR code.</>}</li>
                <li>Enter the <strong className="font-semibold text-white">6-digit code</strong> from the app here, then select <strong className="font-semibold text-white">Verify code</strong>.</li>
            </> : <>
                <li>Open the authenticator app you previously set up on your phone.</li>
                <li>Find the entry{accountEmail ? <> for <strong className="font-semibold text-white break-all">{accountEmail}</strong></> : <> for your current login email</>}. It may be labelled <strong className="font-semibold text-white">4M Padel</strong> or <strong className="font-semibold text-white">4M Banking</strong>. A code for another email will not work.</li>
                <li>Enter its latest <strong className="font-semibold text-white">6-digit code</strong> below, then select <strong className="font-semibold text-white">Verify code</strong>.</li>
            </>}
        </ol>
        {!factor ? <button type="button" className={buttonClass} disabled={busy} onClick={onSetup}>{busy ? 'Setting up…' : 'Set up authenticator'}</button> : <>
            {secret && <div className="space-y-3 max-w-xl">
                {qr && <img src={qr} alt="Scan this QR code with your authenticator app" width="192" height="192" className="max-w-full rounded-xl bg-white p-3" />}
                <details open={!qr} className="text-sm text-gray-300">
                    <summary className="cursor-pointer min-h-11 py-3 rounded-lg focus-visible:outline-2 focus-visible:outline-padel-green">Using this phone or can’t scan the QR code?</summary>
                    <div className="mt-2 space-y-3">
                        <p className="leading-6">In your authenticator app, choose <strong className="font-semibold text-white">Enter a setup key</strong>. Name the account <strong className="font-semibold text-white">4M Padel{accountEmail ? ` · ${accountEmail}` : ''}</strong> and enter this key. If asked, choose <strong className="font-semibold text-white">Time based</strong>.</p>
                        <code className="block break-all select-all rounded-xl border border-white/10 bg-black/20 p-4 text-white">{secret}</code>
                    </div>
                </details>
                <p className="text-xs leading-5 text-gray-400">Keep the QR code and setup key private. Keep access to this app for future verification.</p>
            </div>}
            <form onSubmit={event => { event.preventDefault(); if (!busy && /^\d{6}$/.test(code)) onVerify(); }} className="space-y-3 max-w-sm">
                <label className="block text-sm text-white">6-digit authenticator code
                    <input className={`${fieldClass} mt-2 block tracking-[0.15em]`} name="messaging-authenticator-code" value={code} onChange={event => onCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required disabled={busy} aria-describedby={hintId} />
                </label>
                <p id={hintId} className="text-xs leading-5 text-gray-400">Use the code in your authenticator app. If it expires, wait for the next code.</p>
                <button type="submit" className={buttonClass} disabled={busy || !/^\d{6}$/.test(code)}>{busy ? 'Verifying…' : 'Verify code'}</button>
            </form>
            {!secret && <details className="max-w-xl text-sm text-gray-400">
                <summary className="cursor-pointer min-h-11 py-3 rounded-lg focus-visible:outline-2 focus-visible:outline-padel-green">First time setting up this email?</summary>
                <p className="leading-6">This email already has an authenticator connected. If you set it up for banking, use that same account’s code here. Your first visit to event messages or help requests does not need another setup.</p>
                <p className="mt-2 leading-6">An email with no connected authenticator shows a <strong className="text-white">Set up authenticator</strong> button. If you did not connect the authenticator shown here or have lost access, contact support to recover this account.</p>
            </details>}
            {!secret && <details className="max-w-xl text-sm text-gray-400">
                <summary className="cursor-pointer min-h-11 py-3 rounded-lg focus-visible:outline-2 focus-visible:outline-padel-green">Can’t find your code?</summary>
                <p className="leading-6">Use the app and phone you originally connected to 4M Padel. If you’ve lost access, <a href="/contact" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-padel-green">contact 4M support</a> for help recovering access.</p>
            </details>}
        </>}
        <a href="/admin?tab=security" className="inline-block min-h-11 py-3 text-sm text-white underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-padel-green">Manage authenticators and backup access</a>
    </div>;
}
