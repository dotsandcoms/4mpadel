import SearchableDropdown from "../../components/SearchableDropdown";
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion as Motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Search, ShieldCheck, UserRound, Users, KeyRound, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { Dialog } from './PlayersWorkspace';
import { dateLabel } from './playersData';
import { ACCESS_MODULES, FINANCE_SECTIONS, accessDraft, accessChanges, canManageAccess, loadAccessContext, loadAccessDirectory, normalEmail, searchAccessUsers } from './permissionsData';
import './AccessWorkspace.css';
import EventActionControls from './EventActionControls';
import FinanceEventAccess from './FinanceEventAccess';
import AccessEmailPreview from './AccessEmailPreview';
import GalleryAlbumAccess from './GalleryAlbumAccess';
import { actionPolicyChanges } from './eventActionPolicy';

function AccessStatCount({ value, delay }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) { if (ref.current) ref.current.textContent = value.toLocaleString(); return; }
    const controls = animate(0, value, { duration: .65, delay, ease: 'easeOut', onUpdate: number => {
      if (ref.current) ref.current.textContent = Math.round(number).toLocaleString();
    } });
    return () => controls.stop();
  }, [value, delay, reduceMotion]);
  return <span aria-label={value.toLocaleString()}><span ref={ref} aria-hidden="true">{reduceMotion ? value.toLocaleString() : '0'}</span></span>;
}

function Avatar({ profile }) {
  const [failed, setFailed] = useState(false);
  return <span className="ax-avatar">{profile?.image_url && !failed ? <img src={profile.image_url} alt="" onError={() => setFailed(true)} /> : <UserRound size={22} />}</span>;
}

function AccessEditor({ record, operator, onClose, client }) {
  const original = useMemo(() => accessDraft(record), [record]);
  const [draft, setDraft] = useState(() => accessDraft(record));
  const [actionPolicy, setActionPolicy] = useState({});
  const [context, setContext] = useState({ loading: true, memberships: [], events: [], error: '' });
  const [eventQuery, setEventQuery] = useState('');
  const [editingEvents, setEditingEvents] = useState(false);
  const [assignedPage, setAssignedPage] = useState(1);
  const [eventPickerPage, setEventPickerPage] = useState(1);
  const [review, setReview] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [retry, setRetry] = useState(0);
  const changes = [...accessChanges(original, draft, { events: context.events }), ...actionPolicyChanges(actionPolicy)];
  useEffect(() => {
    const controller = new AbortController();
    // Clear prior access context while the new external lookup is pending.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContext({ loading: true, memberships: [], events: [], error: '' });
    loadAccessContext(client, original.email, controller.signal).then(result => {
      if (!controller.signal.aborted) setContext({ ...result, loading: false, error: '' });
    }).catch(error => { if (!controller.signal.aborted) setContext({ loading: false, memberships: [], events: [], error: error.message }); });
    return () => controller.abort();
  }, [original.email, retry, client]);
  const updateModule = (id, patch) => setDraft(current => ({ ...current, module_permissions: { ...current.module_permissions, [id]: { ...current.module_permissions[id], ...patch } } }));
  const toggleModule = id => setDraft(current => ({ ...current, allowed_tabs: current.allowed_tabs.includes(id) ? current.allowed_tabs.filter(value => value !== id) : [...current.allowed_tabs, id] }));
  const superAdmin = draft.role === 'super_admin';
  const locked = operator.role !== 'super_admin' && original.role === 'super_admin';
  const selectedEvents = draft.module_permissions['event-mgmt']?.allowedEvents || [];
  const assignedPages = Math.max(1, Math.ceil(selectedEvents.length / 4));
  const currentAssignedPage = Math.min(assignedPage, assignedPages);
  const events = context.events.filter(event => `${event.event_name} ${event.id}`.toLowerCase().includes(eventQuery.toLowerCase()));
  const pickerPages = Math.max(1, Math.ceil(events.length / 4));
  const pickerPage = Math.min(eventPickerPage, pickerPages);
  const close = () => changes.length ? setConfirmClose(true) : onClose();
  return <Dialog title="Access & permissions" onClose={close} drawer>
    <div className="ax-editor">
      <div className="ax-person"><Avatar profile={record.profile} /><div><h2>{record.profile?.name || record.email}</h2><p>{record.email}</p></div><span className="ap-status ap-status--info">Local draft</span></div>
      <p className="ax-note">Review access without changing this user’s account. Drafts are discarded when you leave this editor.</p>
      {confirmClose ? <section className="ax-block"><h3>Discard this draft?</h3><p>Your {changes.length} proposed changes have not been applied.</p><div className="ax-actions"><button className="ap-secondary" onClick={() => setConfirmClose(false)}>Keep editing</button><button className="ap-primary" onClick={onClose}>Discard draft</button></div></section> : <>
      {locked && <p role="status">Only a super admin can draft changes to a super-admin account.</p>}
      <fieldset disabled={locked} className="ax-fieldset">
        <section className="ax-block"><h3>01 · Account role</h3><label className="ax-label">Access level<SearchableDropdown value={draft.role} onChange={event => { setReview(false); setDraft(current => ({ ...current, role: event.target.value })); }}><option value="custom">Custom permissions</option><option value="super_admin" disabled={operator.role !== 'super_admin'}>Super admin · all modules</option>{!['custom', 'super_admin'].includes(draft.role) && <option value={draft.role}>{draft.role} · existing role</option>}</SearchableDropdown></label><p>{superAdmin ? 'Super admin overrides individual module and event restrictions.' : 'Choose direct module access below. Membership access is listed separately.'}</p></section>
        <section className="ax-block"><h3>02 · Modules</h3><div className="ax-module-grid">{ACCESS_MODULES.map(([id, label, group]) => <label key={id} className="ax-module"><input type="checkbox" checked={superAdmin || draft.allowed_tabs.includes(id)} disabled={superAdmin || (operator.role !== 'super_admin' && !operator.allowed_tabs?.includes(id))} onChange={() => { setReview(false); toggleModule(id); }} /><span><b>{label}</b><small>{group}</small></span></label>)}</div></section>
        <section className="ax-block"><h3>03 · Event Manager assignments</h3><p>{superAdmin ? 'All events through the super-admin role.' : selectedEvents.length ? `Access is assigned to ${selectedEvents.length} ${selectedEvents.length === 1 ? 'event' : 'events'}.` : 'No specific event restriction is set. The existing module uses its default access rules; this does not mean “no access”.'}</p>
          {context.loading ? <p role="status">Loading events and memberships…</p> : context.error ? <div role="alert"><p>Access context could not be verified: {context.error}</p><button className="ap-secondary" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : <>
            {!superAdmin && <>
            {!editingEvents && <><div className="ax-events ax-assigned-events" aria-label="Assigned events">{selectedEvents.slice((currentAssignedPage - 1) * 4, currentAssignedPage * 4).map(id => {
              const event = context.events.find(item => String(item.id) === String(id));
              return <div className="ax-membership" key={id}><span><b>{event?.event_name || `Event #${id}`}</b><small>Event #{id}{event?.start_date ? ` · ${String(event.start_date).slice(0, 10)}` : ''}{!event ? ' · Details unavailable' : ''}</small></span><span className="ap-status ap-status--info">Assigned</span></div>;
            })}</div>{selectedEvents.length > 4 && <nav className="ax-pagination ax-assigned-pages" aria-label="Assigned event pages"><span role="status">Showing {(currentAssignedPage - 1) * 4 + 1}–{Math.min(currentAssignedPage * 4, selectedEvents.length)} of {selectedEvents.length} events · Page {currentAssignedPage} of {assignedPages}</span><button className="ap-secondary" disabled={currentAssignedPage === 1} onClick={() => setAssignedPage(currentAssignedPage - 1)}>Previous</button><button className="ap-secondary" disabled={currentAssignedPage === assignedPages} onClick={() => setAssignedPage(currentAssignedPage + 1)}>Next</button></nav>}</>}
            {operator.role === 'super_admin' && <div className="ax-event-edit-action"><button className="ap-secondary" aria-expanded={editingEvents} onClick={() => { setEditingEvents(value => !value); setEventQuery(''); setAssignedPage(1); setEventPickerPage(1); }}>{editingEvents ? 'Done · show assigned events' : 'Edit event access'}</button></div>}
            {editingEvents && <div className="ax-event-picker">
            <p className="ax-note">Choose events for this local draft. Changes are not applied to the account.</p>
            <label className="ax-search"><Search size={16} /><input placeholder="Find an event by name or ID" aria-label="Find an event" value={eventQuery} onChange={event => { setEventQuery(event.target.value); setEventPickerPage(1); }} /></label>
            <small role="status">{selectedEvents.length} selected · {events.length ? `Showing ${(pickerPage - 1) * 4 + 1}–${Math.min(pickerPage * 4, events.length)} of ${events.length} matching events` : 'No matching events'}</small><div className="ax-events ax-picker-results">{events.slice((pickerPage - 1) * 4, pickerPage * 4).map(event => <label key={event.id}><input type="checkbox" disabled={superAdmin || operator.role !== 'super_admin'} checked={selectedEvents.some(id => String(id) === String(event.id))} onChange={() => { setReview(false); updateModule('event-mgmt', { allowedEvents: selectedEvents.some(id => String(id) === String(event.id)) ? selectedEvents.filter(id => String(id) !== String(event.id)) : [...selectedEvents, event.id] }); }} /><span>{event.event_name || `Event ${event.id}`}<small>Event #{event.id}{event.start_date ? ` · ${String(event.start_date).slice(0, 10)}` : ''}</small></span></label>)}{!events.length && <p>No matching events. Try a different name or event ID.</p>}</div>
            {events.length > 0 && <nav className="ax-pagination" aria-label="Event selection pages"><span>Page {pickerPage} of {pickerPages}</span><button className="ap-secondary" disabled={pickerPage === 1} onClick={() => setEventPickerPage(pickerPage - 1)}>Previous</button><button className="ap-secondary" disabled={pickerPage === pickerPages} onClick={() => setEventPickerPage(pickerPage + 1)}>Next</button></nav>}
            {selectedEvents.filter(id => !context.events.some(event => String(event.id) === String(id))).length > 0 && <p role="status">Some existing event assignments could not be resolved. They have been preserved.</p>}
            </div>}
            </>}
          </>}
        </section>
        <section className="ax-block"><h3>04 · Finance sections</h3><p>These are the sections recognised by the existing Finance module. Existing event and other granular restrictions are preserved.</p><div className="ax-module-grid">{FINANCE_SECTIONS.map(id => <label key={id} className="ax-module"><input type="checkbox" disabled={superAdmin || !draft.allowed_tabs.includes('finance') || operator.role !== 'super_admin'} checked={superAdmin || (draft.module_permissions.finance ? (draft.module_permissions.finance.allowedTabs || ['transactions']) : FINANCE_SECTIONS).includes(id)} onChange={event => { setReview(false); const current = draft.module_permissions.finance ? (draft.module_permissions.finance.allowedTabs || ['transactions']) : FINANCE_SECTIONS; updateModule('finance', { allowedTabs: event.target.checked ? [...current, id] : current.filter(value => value !== id) }); }} /><span>{id === 'users' ? 'User payments' : id.charAt(0).toUpperCase() + id.slice(1)}</span></label>)}</div></section>
        <FinanceEventAccess selected={draft.module_permissions.finance?.allowedEvents || []} events={context.events} loading={context.loading} error={context.error} inheritedCount={selectedEvents.length} disabled={superAdmin || !draft.allowed_tabs.includes('finance') || operator.role !== 'super_admin'} onChange={allowedEvents => { setReview(false); updateModule('finance', { allowedEvents, allowedTabs: draft.module_permissions.finance ? (draft.module_permissions.finance.allowedTabs || ['transactions']) : FINANCE_SECTIONS }); }} />
        <GalleryAlbumAccess client={client} selected={draft.module_permissions.gallery?.allowedAlbums || []} disabled={superAdmin || !draft.allowed_tabs.includes('gallery') || operator.role !== 'super_admin'} onChange={allowedAlbums => { setReview(false); updateModule('gallery', { allowedAlbums }); }} />
      </fieldset>
      <EventActionControls draft={draft} policy={actionPolicy} onChange={value => { setActionPolicy(value); setReview(false); }} operator={operator} events={context.events} loading={context.loading} error={context.error} />
      <section className="ax-block"><h3>Membership access · existing records</h3><p>Direct module changes do not remove these memberships. Ownership, status and backend rules still determine their effective access.</p>{context.loading ? <p>Checking memberships…</p> : context.error ? <p>Membership access is unknown until the lookup succeeds.</p> : context.memberships.length ? context.memberships.map(item => <div className="ax-membership" key={`${item.type}-${item.id}`}><span><b>{item.name}</b><small>{item.type}</small></span><span className="ap-status ap-status--violet">{item.role}</span></div>) : <p>No direct membership records found. Legacy ownership and server-side grants still require verification.</p>}</section>
      <section className="ax-block ax-summary"><h3><ShieldCheck size={18} /> Draft access summary</h3><p>{superAdmin ? 'All modules through the super-admin role. Individual action proposals do not restrict this role.' : `${draft.allowed_tabs.length} direct modules · ${selectedEvents.length ? `${selectedEvents.length} selected Event Manager events` : 'default Event Manager event rules'}.`}</p><p>{actionPolicyChanges(actionPolicy).length} proposed action rules. This summary describes the draft, not a verified backend access decision.</p></section>
      {review && <section className="ax-block" role="status"><h3>Proposed changes · not applied</h3><ul>{changes.map(change => <li key={change}>{change}</li>)}</ul><p>No permissions have been saved or granted.</p></section>}
      <AccessEmailPreview draft={draft} name={record.profile?.name} events={context.events} />
      <footer className="ax-footer"><span>{changes.length ? `${changes.length} proposed changes` : 'No changes'}</span><button className="ap-secondary" disabled={!changes.length} onClick={() => { setDraft(accessDraft(record)); setActionPolicy({}); setReview(false); }}>Reset</button><button className="ap-primary" disabled={!changes.length || locked} onClick={() => setReview(true)}>Review draft <ArrowRight size={16} /></button></footer>
      </>}
    </div>
  </Dialog>;
}

export default function AccessWorkspace({ session, permissions, client = supabase }) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [role, setRole] = useState('all');
  const [selected, setSelected] = useState(null);
  const [lookup, setLookup] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState({ loading: false, rows: [], error: '' });
  const [refresh, setRefresh] = useState(0);
  const allowed = Boolean(session?.user?.id) && canManageAccess(permissions);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    // Refresh invalidates the previously displayed permission records.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ loading: true, rows: [], error: '' });
    loadAccessDirectory(client, controller.signal).then(rows => { if (!controller.signal.aborted) setState({ loading: false, rows, error: '' }); }).catch(error => { if (!controller.signal.aborted) setState({ loading: false, rows: [], error: error.message }); });
    return () => controller.abort();
  }, [allowed, refresh, client]);
  useEffect(() => {
    const controller = new AbortController();
    // A changed lookup must immediately stop offering stale user matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsers({ loading: Boolean(lookup && search.trim().length >= 3), rows: [], error: '' });
    if (!allowed || !lookup || search.trim().length < 3) return () => controller.abort();
    const timer = setTimeout(() => searchAccessUsers(client, search, controller.signal).then(rows => { if (!controller.signal.aborted) setUsers({ loading: false, rows, error: '' }); }).catch(error => { if (!controller.signal.aborted) setUsers({ loading: false, rows: [], error: error.message }); }), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [allowed, lookup, search, client]);
  if (!allowed) return <section className="ap-section ax-block"><ShieldCheck size={28} /><h2>Access management permission is required</h2><p>This workspace is available to super admins and users with the existing admin-management permission.</p></section>;
  const rows = state.rows.filter(row => `${row.email} ${row.profile?.name || ''}`.toLowerCase().includes(query.toLowerCase()) && (role === 'all' || (role === 'super_admin' ? row.role === role : row.role !== 'super_admin')));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), current = Math.min(page, pages);
  const pagination = position => <nav className="ax-pagination" aria-label={`Permission record pages ${position}`}>
    <span role="status">{rows.length ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, rows.length)} of ${rows.length} records` : '0 records'}</span>
    <label>Rows <SearchableDropdown aria-label={`Rows per page ${position}`} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[5, 10, 20].map(size => <option key={size} value={size}>{size}</option>)}</SearchableDropdown></label>
    <button className="ap-secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
    <label>Page <SearchableDropdown aria-label={`Page ${position}`} value={current} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</SearchableDropdown> of {pages}</label>
    <button className="ap-secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button>
  </nav>;
  const openUser = profile => {
    const existing = state.rows.find(row => normalEmail(row.email) === normalEmail(profile.email));
    setLookup(false); setSearch(''); setSelected(existing || { email: profile.email, role: 'custom', allowed_tabs: [], module_permissions: {}, profile });
  };
  return <div className="ax-workspace">
    <header className="ax-heading"><div><p className="ap-kicker">System / Access & permissions</p><h1>Give the right people the right access.</h1><p>Review direct grants, event assignments and membership access in one place.</p></div><button className="ap-primary" disabled={state.loading || Boolean(state.error)} onClick={() => setLookup(true)}><Users size={17} /> Choose existing user</button></header>
    <div className="ax-stats">{[[Users, 'Permission records', state.rows.length], [ShieldCheck, 'Super-admin records', state.rows.filter(row => row.role === 'super_admin').length], [KeyRound, 'Custom / other records', state.rows.filter(row => row.role !== 'super_admin').length]].map(([Icon, label, value], index) => <Motion.section key={label} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .3, delay: reduceMotion ? 0 : index * .08, ease: 'easeOut' }}>{createElement(Icon, { className: 'ax-watermark', size: 86, 'aria-hidden': true })}<span>{label}</span><strong>{state.loading || state.error ? '—' : <AccessStatCount value={value} delay={index * .08} />}</strong></Motion.section>)}</div>
    <p className="ax-note"><ShieldCheck size={17} /> Read-only preview. Review a local draft; live access stays as currently configured. Counts cover direct permission records, not every user with inherited access.</p>
    <div className="ax-toolbar"><label className="ax-search"><Search size={17} /><input aria-label="Search permission records" placeholder="Search name or email" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label>Role <SearchableDropdown value={role} onChange={event => { setRole(event.target.value); setPage(1); }}><option value="all">All roles</option><option value="super_admin">Super admin</option><option value="custom">Custom / other</option></SearchableDropdown></label><button className="ap-icon-button" aria-label="Refresh permission records" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} /></button></div>
    {state.loading ? <section className="ax-block" role="status">Loading permission records…</section> : state.error ? <section className="ax-block" role="alert"><h2>Permission records could not be loaded</h2><p>{state.error}</p><button className="ap-secondary" onClick={() => setRefresh(value => value + 1)}>Try again</button></section> : <>
      {pagination('top')}
      <div className="ax-directory">
        <div className="ax-directory-head" aria-hidden="true"><span>User</span><span>Role</span><span>Direct modules</span><span>Event Manager access</span><span>Record created</span><span /></div>
        {rows.slice((current - 1) * pageSize, current * pageSize).map(row => {
          const isSuper = row.role === 'super_admin';
          const modules = (row.allowed_tabs || []).map(id => ACCESS_MODULES.find(module => module[0] === id)?.[1] || id);
          const count = row.module_permissions?.['event-mgmt']?.allowedEvents?.length || 0;
          return <button className="ax-row ax-directory-row" key={row.email} onClick={() => setSelected(row)}>
            <span className="ax-directory-person"><Avatar profile={row.profile} /><span className="ax-name"><b>{row.profile?.name || row.email}</b>{row.profile?.name && <small>{row.email}</small>}</span></span>
            <span className={`ap-status ap-status--${isSuper ? 'violet' : 'info'}`}>{isSuper ? 'Super admin' : row.role === 'custom' ? 'Custom' : row.role || 'Not recorded'}</span>
            <span className="ax-cell"><small className="ax-mobile-label">Direct modules</small><span title={isSuper ? 'All modules' : modules.join(', ')}>{isSuper ? 'All modules' : modules.length ? `${modules.slice(0, 3).join(', ')}${modules.length > 3 ? ` +${modules.length - 3} more` : ''}` : 'No direct modules'}</span></span>
            <span className="ax-cell"><small className="ax-mobile-label">Event Manager access</small><span className={count && !isSuper ? 'ax-event-count' : ''}>{isSuper ? 'All events' : count ? `${count} assigned ${count === 1 ? 'event' : 'events'}` : row.allowed_tabs?.includes('event-mgmt') ? 'Default event access' : 'No direct event grant'}</span></span>
            <span className="ax-cell ax-created"><small className="ax-mobile-label">Record created</small>{dateLabel(row.created_at)}</span><ArrowRight size={17} />
          </button>;
        })}
        {!rows.length && <p className="ax-block">{state.rows.length ? 'No matching permission records.' : 'No direct permission records found. Choose an existing user to explore their access.'}</p>}
      </div>
      {pagination('bottom')}
    </>}
    {lookup && <Dialog title="Choose an existing user" onClose={() => { setLookup(false); setSearch(''); }}><div className="ax-block"><label className="ax-search"><Search size={17} /><input aria-label="Search existing users" placeholder="Type at least 3 characters of a name or email" value={search} onChange={event => setSearch(event.target.value)} /></label><p>Searches existing player records with an email address. No account is created.</p>{users.loading ? <p role="status">Searching…</p> : users.error ? <p role="alert">{users.error}</p> : users.rows.map(profile => <button className="ax-row" key={profile.id} onClick={() => openUser(profile)}><Avatar profile={profile} /><span className="ax-name"><b>{profile.name}</b><small>{profile.email}</small></span><Check size={17} /></button>)}{!users.loading && !users.error && search.trim().length >= 3 && !users.rows.length && <p>No matching users.</p>}{users.rows.length === 20 && <p>Showing the first 20 matches. Refine your search to find someone specific.</p>}</div></Dialog>}
    {selected && <AccessEditor key={selected.email} record={selected} operator={permissions} client={client} onClose={() => setSelected(null)} />}
  </div>;
}
