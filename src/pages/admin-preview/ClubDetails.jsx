import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import RecordLoading from './RecordLoading.jsx';
import { loadClubDetails, recordedText, safeClubWebsite, clubFlag } from './clubDetailsData.js';
import { clubStatusLabel } from './clubsData.js';
import ClubMedia from './ClubMedia.jsx';
import FullClubProfileEditor from './FullClubProfileEditor.jsx';
import ClubManagement from './ClubManagement.jsx';
import ClubInvitations from './ClubInvitations.jsx';
import ClubOrganisations from './ClubOrganisations.jsx';
import ClubApplicationDecision from './ClubApplicationDecision.jsx';
import { isClubDecisionEnabled } from './clubDecisionRpc.js';

function Fields({ rows }) {
  return <dl className="clubs-fields">{rows.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{recordedText(value)}</dd></React.Fragment>)}</dl>;
}
export default function ClubDetails({ club, client, session, permissions, scopeId, onClose, onUpdated }) {
  const dialogRef = useRef(null), heading = useRef(null), titleId = useId();
  const [state, setState] = useState({ loading: true }), [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const busyRef = useRef(false), [saving, setSaving] = useState(false);
  const contextRef = useRef(''); contextRef.current = `${club.id}:${session?.user?.id}:${scopeId}`;
  const close = () => { if (!busyRef.current) onClose(); };
  useEffect(() => {
    const dialog = dialogRef.current, trigger = document.activeElement, overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden'; heading.current.focus({ preventScroll: true });
    return () => { dialog.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ error: 'Loading took too long. Please try again.' }); }, 20000);
    loadClubDetails(client, session, permissions, scopeId, club.id, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); })
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [client, session?.user?.id, permissions?.role, scopeId, club.id, reload]);
  const data = state.data, website = safeClubWebsite(data?.website_url);
  const decisionBusy = value => { busyRef.current = value; setSaving(value); };
  const refreshDecision = async () => {
    const context = contextRef.current;
    try {
      const { data: fresh, error } = await client.from('clubs').select('id,name,status,verified,sapa_registered').eq('id', club.id).single();
      if (!error && fresh && contextRef.current === context && dialogRef.current?.open) { setState(previous => ({ ...previous, data: { ...previous.data, ...fresh } })); onUpdated?.({ ...club, ...data, ...fresh }); }
    } catch { /* The recorded decision remains confirmed; reopening reloads the profile. */ }
  };
  return <dialog ref={dialogRef} className="fo-ledger-drawer" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab' || event.target.closest('dialog') !== event.currentTarget) return;
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"],summary')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header className="fo-heading fo-drawer-header"><div><h2 ref={heading} id={titleId} tabIndex={-1}>{data?.name || club.name || 'Club details'}</h2><p>Club profile · Platform administration</p></div><button className="ap-icon-button" aria-label="Close club details" disabled={saving} onClick={close}><X size={22}/></button></header>
    <div className="fo-drawer-body" tabIndex={0} aria-label="Club details content">
      {data && <label className="fo-status-filter clubs-jump">Jump to section<SearchableDropdown defaultValue="" onChange={event => {
        const target = [...dialogRef.current.querySelectorAll('h3')].find(node => node.textContent === event.target.value);
        if (target) { target.setAttribute('tabindex', '-1'); target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }
        event.target.value = '';
      }}><option value="" disabled>Choose a section</option>{['Directory record', 'About the club', 'Location & contact', 'Courts', 'Services', 'Café / restaurant', 'Opening hours', 'Social & booking links', 'Sponsors & partners', 'Gallery', 'Record information'].map(label => <option key={label}>{label}</option>)}</SearchableDropdown></label>}
      <section><h3>Directory record</h3><Fields rows={[
        ['Club status', clubStatusLabel(data?.status ?? club.status)], ['Verification', clubFlag(data?.verified ?? club.verified, 'Verified', 'Not verified')], ['SAPA registration', clubFlag(data?.sapa_registered ?? club.sapa_registered, 'Registered', 'Not registered')],
        ['Club type', club.club_type], ['City', data ? data.city : club.city], ['Province', club.province], ['Country', club.country], ['Club ID', club.id],
      ]}/></section>
      {state.loading ? <section className="ap-section"><RecordLoading label="Loading club profile…" detail="Reading profile, facilities and opening hours for this club."/></section> : state.error ? <section role="alert"><h3>Profile unavailable</h3><p>{state.error}</p><button className="ap-secondary" onClick={() => setReload(n => n + 1)}>Try again</button></section> : data && <>
        <section className="clubs-draft"><h3>Edit club details</h3><p>Manage the complete profile, facilities, branding and media. Review all changes before saving.</p><button className="ap-secondary" disabled={saving} onClick={() => setEditing(true)}>Edit club details</button></section>
        {isClubDecisionEnabled(client) && ['pending', 'in_review'].includes(data?.status ?? club.status) && <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><ClubApplicationDecision key={`application-${club.id}`} record={{ ...club, ...data }} client={client} scopeId={scopeId} session={session} onBusyChange={decisionBusy} onSaved={refreshDecision}/></fieldset>}
        {editing && <FullClubProfileEditor key={`${session?.user?.id}-${club.id}`} record={{ ...club, ...data }} client={client} scopeId={scopeId} onClose={() => setEditing(false)} onBusyChange={value => { busyRef.current = value; setSaving(value); }}
          onSaved={record => { setState({ data: record }); onUpdated?.(record); setEditing(false); }}/ >}
        <section><h3>About the club</h3><p className="clubs-copy">{recordedText(data.tagline)}</p><p className="clubs-copy">{recordedText(data.about)}</p></section>
        <section><h3>Location & contact</h3><Fields rows={[
          ['Address', data.address], ['Email', data.contact_email], ['Phone', data.contact_phone], ['WhatsApp', data.whatsapp_number],
        ]}/>{website ? <a className="fo-type-link" href={website} target="_blank" rel="noopener noreferrer">Visit club website ↗</a> : <p>Website: {recordedText(data.website_url)}</p>}</section>
        <section><h3>Courts</h3><Fields rows={['indoor', 'outdoor'].flatMap(side => [[`${side === 'indoor' ? 'Indoor' : 'Outdoor'} courts`, data.courts?.[side]?.count], [`${side === 'indoor' ? 'Indoor' : 'Outdoor'} features`, Array.isArray(data.courts?.[side]?.features) ? data.courts[side].features.map(recordedText).join(', ') : data.courts?.[side]?.features]])}/></section>
        <section><h3>Services</h3>{Array.isArray(data.services) && data.services.length ? <ul className="clubs-services">{data.services.map((service, index) => <li key={index}><strong>{recordedText(typeof service === 'string' ? service : service?.title)}</strong>{service?.description && <p>{recordedText(service.description)}</p>}</li>)}</ul> : <p>{data.services && !Array.isArray(data.services) ? 'Service records could not be interpreted.' : 'No services recorded.'}</p>}</section>
        <section><h3>Café / restaurant</h3><Fields rows={['name', 'description', 'hours_note'].map(key => [key === 'hours_note' ? 'Hours note' : key === 'name' ? 'Name' : 'Description', data.cafe?.[key]])}/></section>
        <section><h3>Opening hours</h3><Fields rows={Object.entries({ mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }).map(([key, label]) => { const hours = data.opening_hours?.[key]; return [label, hours?.closed === true ? 'Closed' : hours?.open && hours?.close ? `${recordedText(hours.open)}–${recordedText(hours.close)}` : 'Not recorded']; })}/></section>
        <ClubMedia key={club.id} data={data}/>
        <ClubOrganisations club={{ ...club, ...data }} client={client} session={session} scopeId={scopeId}/>
        <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><ClubManagement key={`management-${club.id}`} client={client} session={session} permissions={permissions} scopeId={scopeId} clubId={club.id} onBusyChange={decisionBusy} onDecisionSaved={refreshDecision}/></fieldset>
        <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><ClubInvitations key={`invitations-${club.id}`} client={client} session={session} scopeId={scopeId} clubId={club.id} onBusyChange={decisionBusy}/></fieldset>
        <section><h3>Record information</h3><Fields rows={[['Created', data.created_at], ['Last updated', data.updated_at]]}/></section>
      </>}
      <p className="fo-note">Full club profile and media changes can be saved after review. Decisions, member changes and invitation creation have separate staging-only gates. Invitation delivery, organisation access changes and permanent club deletion remain held.</p>
    </div>
  </dialog>;
}
