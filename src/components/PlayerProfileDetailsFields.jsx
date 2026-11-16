import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { ageFromBirthDate, profileToday, PROOF_BUCKET, PROOF_TYPES, proofFileError, playtomicError, extractPlaytomicProfile, playtomicPrivateFields } from '../utils/profileDetails';

const controlClass = 'block min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green';

function ScreenshotProcessingDialog({ open, uploading, success, onDismiss }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={ref} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onDismiss(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Tab') {
        // This progress dialog has one action; keep keyboard focus on it.
        event.preventDefault();
        ref.current?.querySelector('button')?.focus();
      }
    }}
    className="m-auto max-w-sm rounded-2xl border border-white/15 bg-[#111] p-6 text-center text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    style={{ width: 'calc(100% - 2rem)' }}>
    {success ? <svg data-testid="extraction-success" aria-hidden="true" viewBox="0 0 48 48" className="mx-auto mb-5 h-12 w-12 text-green-400" fill="none"><circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="3" /><path d="m13 24 7 7 15-16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg> : <div aria-hidden="true" className="mx-auto mb-5 h-11 w-11 rounded-full border-[3px] border-white/15 border-t-padel-green motion-safe:animate-spin" />}
    <h2 id={`${id}-title`} className="text-xl font-bold leading-7">{success ? 'Playtomic details extracted' : uploading ? 'Uploading your screenshot' : 'We’re extracting your Playtomic level'}</h2>
    <p id={`${id}-description`} role="status" className="mt-3 text-sm leading-6 text-gray-300">{success ? 'Check the suggested details before saving.' : uploading ? 'Please wait while your screenshot uploads.' : '4M is processing the screenshot. Check the suggested level before saving.'}</p>
    {success && <ExtractionSummary result={success} prominent />}
    <button type="button" onClick={onDismiss} className="mt-5 min-h-11 rounded-xl border border-white/20 px-5 text-sm font-semibold text-padel-green hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">{success ? 'Done' : 'Keep editing'}</button>
  </dialog>, document.body);
}

function ExtractionSummary({ result, prominent = false }) {
  return <dl className={`space-y-1 text-sm ${prominent ? 'mt-4 text-white' : 'text-gray-300'}`}>
    <div><dt className="inline">Extracted level: </dt><dd className={`inline font-bold ${prominent ? 'text-2xl text-green-400' : ''}`}>{result.level == null ? 'Not visible' : result.level.toFixed(2)}</dd></div>
    <div><dt className="inline">Matches: </dt><dd className="inline font-semibold">{result.matches ?? 'Not visible'}</dd></div>
    <div><dt className="inline">Level reliability: </dt><dd className="inline font-semibold">{result.reliability_percent == null ? 'Not visible' : `${result.reliability_percent}%`}</dd></div>
  </dl>;
}

export function BirthDateField({ value, onChange, required = true, admin = false, fallbackAge = null }) {
  const age = ageFromBirthDate(value) ?? (!value ? fallbackAge : null);
  return <div className="flex flex-wrap gap-4">
    <label className="block flex-[2] space-y-2 text-sm text-white" style={{ minWidth: 'min(100%, 13rem)' }}>
      <span className="font-semibold">Date of birth <span className="text-padel-green">({required ? 'required' : 'optional'})</span></span>
      <input required={required} name="date_of_birth" type="date" autoComplete="bday" min="1900-01-01" max={profileToday()} value={value || ''} onChange={event => onChange(event.target.value)} className={`${controlClass} min-w-0`} style={{ colorScheme: 'dark' }} />
      <span className="block text-xs leading-5 text-gray-400">{admin ? 'The birth date stays private. The player’s profile shows their age.' : 'Your date of birth stays private. Your profile shows your age.'}</span>
    </label>
    <label className="block min-w-24 flex-1 space-y-2 text-sm text-white">
      <span className="font-semibold">Age</span>
      <input name="calculated_age" type="text" readOnly value={age ?? ''} placeholder="—" aria-label="Age (calculated from date of birth)" className={`${controlClass} cursor-default`} />
      <span className="block text-xs leading-5 text-gray-400">{!value && fallbackAge != null ? 'Saved age. Add a birth date to calculate it automatically.' : 'Calculated from date of birth.'}</span>
    </label>
  </div>;
}

export function PlayerProfileDetailsFields({ playerId, signupUserId, value, onChange, disabled = false, onBusyChange, admin = false }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [reading, setReading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [progressDismissed, setProgressDismissed] = useState(false);
  const [readRequest, setReadRequest] = useState(null);
  const [readFailed, setReadFailed] = useState(false);
  const [readMessage, setReadMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const path = value.playtomic_proof_path;
  const pathRef = useRef(path);
  pathRef.current = path;
  const levelRef = useRef(value.playtomic_level);
  levelRef.current = value.playtomic_level;
  const callbacks = useRef({ onChange, onBusyChange });
  callbacks.current = { onChange, onBusyChange };
  const uploadPrefix = playerId ? String(playerId) : signupUserId ? `signup/${signupUserId}` : '';
  const levelError = touched && !value.playtomic_no_profile ? playtomicError(value.playtomic_level) : null;
  const extracted = path && (value.playtomic_extracted_at || value.playtomic_extracted_level != null || value.playtomic_matches != null || value.playtomic_reliability_percent != null) ? { level: value.playtomic_extracted_level ?? null, matches: value.playtomic_matches ?? null, reliability_percent: value.playtomic_reliability_percent ?? null } : null;
  useEffect(() => {
    let active = true;
    setSuccess(null);
    setReadMessage('');
    setReadFailed(false);
    setError('');
    setPreview('');
    if (path) supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 300).then(({ data, error: issue }) => {
      if (!active) return;
      if (issue) setError('The saved proof could not be opened. Please try again.');
      else setPreview(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);

  useEffect(() => { callbacks.current.onBusyChange?.(busy || reading); }, [busy, reading]);
  useEffect(() => () => { callbacks.current.onBusyChange?.(false); }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 2000);
    return () => clearTimeout(timer);
  }, [success]);

  // Only a new upload (or an explicit retry) creates a request. Reopening a
  // saved profile never reprocesses its screenshot or overwrites its level.
  useEffect(() => {
    if (!readRequest || readRequest.path !== path) { setReading(false); return; }
    let active = true;
    setReading(true);
    setReadFailed(false);
    setReadMessage('');
    void extractPlaytomicProfile(supabase, path).then(result => {
      if (!active || pathRef.current !== readRequest.path) return;
      if (result === null) {
        setReadFailed(true);
        setReadMessage('No clear Playtomic details were found. Enter your level manually or retry.');
        return;
      }
      const keepEdited = String(levelRef.current ?? '') !== readRequest.initialLevel;
      callbacks.current.onChange(previous => previous.playtomic_proof_path !== readRequest.path ? previous : {
        ...previous, playtomic_extracted_level: result.level, playtomic_matches: result.matches,
        playtomic_reliability_percent: result.reliability_percent,
        ...(result.level !== null && String(previous.playtomic_level ?? '') === readRequest.initialLevel ? { playtomic_level: String(result.level) } : {}),
      });
      setSuccess(result);
      setReadFailed(result.level === null);
      setReadMessage(result.level === null ? 'No clear padel level was found. Enter your level manually.' : keepEdited
        ? `Screenshot level: ${result.level.toFixed(2)}. Your edited level was kept.`
        : `Playtomic level filled from screenshot: ${result.level.toFixed(2)}. Check it before saving.`);
    }).catch(issue => {
      if (!active || pathRef.current !== readRequest.path) return;
      setReadFailed(true);
      setReadMessage(issue.message || 'Enter your level manually or try again.');
    }).finally(() => { if (active) setReading(false); });
    return () => { active = false; };
  }, [readRequest, path]);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const invalid = proofFileError(file);
    if (invalid) { setError(invalid); return; }
    const initialLevel = String(levelRef.current ?? '');
    setSuccess(null);
    setProgressDismissed(false);
    setBusy(true);
    setError('');
    try {
      if (!uploadPrefix) throw new Error('Sign in before uploading a screenshot.');
      const nextPath = `${uploadPrefix}/${crypto.randomUUID()}.${PROOF_TYPES[file.type]}`;
      const { error: issue } = await supabase.storage.from(PROOF_BUCKET).upload(nextPath, file, { contentType: file.type, upsert: false, cacheControl: '0' });
      if (issue) throw new Error('Your screenshot could not be uploaded. Please try again.');
      setReading(true);
      onChange(previous => ({ ...previous, ...playtomicPrivateFields(null), playtomic_proof_path: nextPath }));
      setReadRequest({ path: nextPath, initialLevel });
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return <fieldset disabled={disabled || busy} className="space-y-4 rounded-2xl border border-white/10 p-4 md:p-5">
    <ScreenshotProcessingDialog open={(busy || reading || !!success) && !progressDismissed} uploading={busy} success={success} onDismiss={() => { setProgressDismissed(true); setSuccess(null); }} />
    <legend className="px-1 text-sm font-bold text-white">Playtomic Level</legend>
    <p id={`${id}-help`} className="text-sm leading-6 text-gray-400">{admin ? 'Enter the player’s current Playtomic padel level. A profile screenshot is required unless the player has no Playtomic profile or level and visible only to the player and authorized admins.' : 'Enter your current Playtomic padel level. A profile screenshot is required unless you have no Playtomic profile or level and visible only to you and authorized admins.'}</p>
    <label className="flex min-h-11 items-center gap-3 text-sm text-white">
      <input type="checkbox" name="playtomic_no_profile" checked={value.playtomic_no_profile === true} onChange={event => {
        const checked = event.target.checked;
        setReadRequest(null); setSuccess(null); setTouched(false);
        onChange(previous => ({ ...previous, ...playtomicPrivateFields(null), playtomic_no_profile: checked,
          ...(checked ? { playtomic_level: '', playtomic_proof_path: '' } : {}) }));
      }} className="h-5 w-5 accent-padel-green" />
      <span>{admin ? 'The player confirms they don’t have a Playtomic profile or level' : 'I don’t have a Playtomic profile or level'}</span>
    </label>
    {value.playtomic_no_profile ? <p role="status" className="text-sm text-gray-300">{admin ? 'The player can continue without a Playtomic level or screenshot.' : 'You can continue without a Playtomic level or screenshot.'}</p> : <>
    <label className="block space-y-2 text-sm font-semibold text-white">
      <span>Playtomic Level (required)</span>
      <input required name="playtomic_level" type="number" inputMode="decimal" min="0" max="7" step="0.01" placeholder="e.g. 3.25" value={value.playtomic_level ?? ''} onBlur={() => setTouched(true)} onChange={event => onChange(previous => ({ ...previous, playtomic_level: event.target.value }))} aria-invalid={!!levelError} aria-describedby={`${id}-help${levelError ? ` ${id}-error` : ''}`} className={controlClass} />
      {levelError && <span id={`${id}-error`} role="alert" className="block text-sm text-red-300">{levelError}</span>}
    </label>
    <label className="block space-y-2 text-sm font-semibold text-white">
      <span>{admin ? 'Upload a screenshot of the player’s Playtomic profile (required)' : 'Upload a screenshot of your Playtomic profile (required)'}</span>
      <input disabled={!uploadPrefix} required={!path} aria-invalid={!!error} aria-describedby={`${id}-upload-help${error ? ` ${id}-upload-error` : ''}`} onInvalid={event => { event.preventDefault(); setError('Upload a screenshot or confirm you do not have a Playtomic profile or level.'); event.currentTarget.focus(); }} name="playtomic_proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className={`${controlClass} file:mr-3 file:rounded-md file:border-0 file:bg-padel-green file:px-3 file:py-2 file:font-semibold file:text-black`} />
      <span id={`${id}-upload-help`} className="block text-xs font-normal text-gray-400">JPG, PNG or WebP · up to 5 MB. {admin ? 'Save the player profile to submit.' : 'Save your profile to submit.'}</span>
    </label>
    {busy && <p role="status" className="text-sm text-padel-green">Uploading screenshot…</p>}
    {error && <p id={`${id}-upload-error`} role="alert" className="text-sm text-red-300">{error}</p>}
    {preview && <a href={preview} target="_blank" rel="noopener noreferrer" className="block w-fit rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green">
      <img src={preview} alt={admin ? 'Player Playtomic level proof; open full image' : 'Your uploaded Playtomic level proof; open full image'} className="max-h-48 max-w-full rounded-lg border border-white/10 object-contain" />
      <span className="mt-2 block text-sm text-padel-green underline underline-offset-4">View screenshot</span>
    </a>}
    {path && <div className="space-y-2">
      <div role="status" aria-live="polite" className="text-sm text-gray-300">
        {reading && progressDismissed && <p>4M is processing the screenshot. Check the suggested level before saving.</p>}
        {readMessage && <p>{readMessage}</p>}
        {extracted && <ExtractionSummary result={extracted} />}
      </div>
      {readFailed && !reading && <button type="button" onClick={() => { setSuccess(null); setProgressDismissed(false); setReading(true); setReadRequest({ path, initialLevel: String(levelRef.current ?? '') }); }} className="min-h-11 rounded-lg border border-white/20 px-3 text-sm text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green">Retry reading screenshot</button>}
      <button type="button" onClick={() => { setError(''); setReadRequest(null); setSuccess(null); onChange(previous => ({ ...previous, ...playtomicPrivateFields(null), playtomic_proof_path: '' })); }} className="min-h-11 text-sm text-gray-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green">Remove screenshot</button>
    </div>}
    </>}
    <p className="text-xs leading-5 text-gray-400">This is a player-submitted level. A screenshot or suggested level does not mark it as verified by Playtomic.</p>
  </fieldset>;
}
