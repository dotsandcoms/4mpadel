import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import { fetchAllRows } from '../../../utils/fetchAllRows';

const FinanceManager = lazy(() => import('../../../components/admin/FinanceManager.jsx'));
const EventFinance = lazy(() => import('../../../components/admin/EventFinance.jsx'));
const LicenceManager = lazy(() => import('../../../components/admin/LicenseManager.jsx'));
const OrganisationBankingDetails = lazy(() => import('../../../components/admin/OrganisationBankingDetails.jsx'));
const ManualEventRegistrations = lazy(() => import('../../../components/admin/ManualEventRegistrations.jsx'));

const selectClass = 'min-h-11 w-full rounded-xl border border-white/20 bg-[#181a19] px-3 text-white';
const buttonClass = 'min-h-11 rounded-xl bg-padel-green px-4 py-2 font-semibold text-black disabled:opacity-50';

function AccessRequired({ title, children }) {
  return <section className="ap-section p-6"><h1>{title}</h1><p>{children}</p></section>;
}

function FinanceSurface({ children }) {
  return (
    <section className="min-w-0 rounded-2xl bg-[#141614] p-4 text-white sm:p-6">
      <Suspense fallback={<p role="status">Loading finance tools…</p>}>{children}</Suspense>
    </section>
  );
}

function payoutOrganisations(permissions) {
  return (permissions?.orgs || []).filter(org => ['owner', 'admin'].includes(org.member_role || permissions.orgRole));
}

function PayoutWorkspace({ permissions, scopeId }) {
  const platform = permissions.role === 'super_admin';
  const scopeOrganisation = scopeId.startsWith('org:') ? scopeId.slice(4) : null;
  const authorisedOrganisations = payoutOrganisations(permissions);
  const [platformOrganisations, setPlatformOrganisations] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState('');

  useEffect(() => {
    if (!platform) return;
    let active = true;
    fetchAllRows(() => {
      let query = supabase.from('organisations').select('id, name').order('name').order('id');
      if (scopeOrganisation) query = query.eq('id', scopeOrganisation);
      return query;
    }).then(rows => {
      if (active) setPlatformOrganisations(rows);
    }).catch(failure => {
      if (active) setError(failure.message || 'Could not load organisations.');
    });
    return () => { active = false; };
  }, [platform, scopeOrganisation, retry]);

  const organisations = platform ? platformOrganisations : authorisedOrganisations;
  const organisationId = scopeOrganisation || selection || (organisations?.length === 1 ? organisations[0].id : '');
  const organisation = organisations?.find(row => row.id === organisationId);

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-bold">Organiser payouts</h1><p className="mt-1 text-gray-400">Manage a payout account, review existing requests, or open an event’s settlement.</p></header>
      {error && <p role="alert">{error} <button type="button" className="underline" onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry</button></p>}
      {!organisations && !error && <p role="status">Loading organisations…</p>}
      {organisations && !scopeOrganisation && (
        <label className="block max-w-md space-y-2">
          <span>Organisation</span>
          <select className={selectClass} value={organisationId} onChange={event => setSelection(event.target.value)}>
            <option value="">Choose an organisation</option>
            {organisations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </label>
      )}
      {scopeOrganisation && organisations && !organisation && <p role="status">This organisation is unavailable.</p>}
      {organisation && (
        <OrganisationPayoutTools key={organisation.id} organisation={organisation} />
      )}
    </div>
  );
}

function OrganisationPayoutTools({ organisation }) {
  const [events, setEvents] = useState(null);
  const [selection, setSelection] = useState('');
  const [request, setRequest] = useState(null);
  const [retry, setRetry] = useState(0);
  const [event, setEvent] = useState(null);
  const [listError, setListError] = useState('');
  const [eventError, setEventError] = useState('');

  useEffect(() => {
    let active = true;
    fetchAllRows(() => supabase.from('calendar').select('id, event_name, start_date')
      .eq('organisation_id', organisation.id).eq('is_manual', true)
      .order('start_date', { ascending: false }).order('id')
    ).then(rows => {
      if (active) setEvents(rows);
    }).catch(failure => {
      if (active) setListError(failure.message || 'Could not load events.');
    });
    return () => { active = false; };
  }, [organisation.id, retry]);

  useEffect(() => {
    if (!request) return;
    let active = true;
    supabase.from('calendar').select('*').eq('organisation_id', organisation.id)
      .eq('is_manual', true).eq('id', request.id).single().then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setEventError(error?.message || 'This event is unavailable.');
        else setEvent(data);
      }).catch(failure => {
        if (active) setEventError(failure.message || 'Could not load event finances.');
      });
    return () => { active = false; };
  }, [organisation.id, request]);

  if (event) return (
    <ManualEventRegistrations
      key={event.id}
      isOpen
      variant="inline"
      initialTab="statement"
      event={event}
      backLabel="← Back to organiser payouts"
      onEventCancelled={updated => setEvent(current => ({ ...current, ...updated }))}
      onBack={() => { setEvent(null); setRequest(null); }}
    />
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{organisation.name}</h2>
      <OrganisationBankingDetails organisationId={organisation.id} />
      <form className="space-y-3 rounded-xl border border-white/15 p-4" onSubmit={submit => {
        submit.preventDefault();
        if (!events?.some(row => String(row.id) === selection)) return;
        setEventError('');
        setRequest({ id: selection });
      }}>
        <h3 className="font-semibold">Event settlement</h3>
        {listError && <p role="alert">{listError} <button type="button" className="underline" onClick={() => { setListError(''); setRetry(value => value + 1); }}>Retry</button></p>}
        {eventError && <p role="alert">{eventError}</p>}
        {!events && !listError && <p role="status">Loading events…</p>}
        {events?.length === 0 && <p>No manual events are linked to this organisation.</p>}
        {Boolean(events?.length) && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-full max-w-md space-y-2">
              <span>Event</span>
              <select className={selectClass} value={selection} onChange={change => {
                setSelection(change.target.value);
                setRequest(null);
                setEventError('');
              }}>
                <option value="">Choose an event</option>
                {events.map(row => <option key={row.id} value={row.id}>{row.event_name}{row.start_date ? ` · ${row.start_date}` : ''}</option>)}
              </select>
            </label>
            <button type="submit" className={buttonClass} disabled={!selection || Boolean(request && !eventError)}>
              {request && !eventError ? 'Opening event…' : 'Open event finances'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export function CurrentFinance({ session, permissions, scopeId = 'all', page, refreshRevision = 0 }) {
  const location = useLocation();
  const platform = permissions?.role === 'super_admin';
  const key = `${session?.user?.id || ''}:${scopeId}:${page}:${refreshRevision}`;

  if (page === 'payouts') {
    const organisationScope = scopeId.startsWith('org:');
    const mayManageAny = payoutOrganisations(permissions).some(org => !organisationScope || scopeId === `org:${org.id}`);
    if (!session?.user?.id || !(platform || mayManageAny)) {
      return <AccessRequired title="Payouts">Payouts are available to organisation owners and admins, and 4M super admins.</AccessRequired>;
    }
    if (scopeId !== 'all' && !organisationScope) {
      return <AccessRequired title="Payouts">Select your account or an organisation workspace to manage organiser payouts.</AccessRequired>;
    }
    return <FinanceSurface><PayoutWorkspace key={key} permissions={permissions} scopeId={scopeId} /></FinanceSurface>;
  }

  if (!session?.user?.id || !(platform || permissions?.allowed_tabs?.includes('finance'))) {
    return <AccessRequired title="Finance">Finance access is required.</AccessRequired>;
  }

  if (scopeId !== 'all') {
    const financePermission = permissions?.module_permissions?.finance;
    const allowedFinanceEvents = financePermission?.allowedEvents || [];
    const allowedEvents = allowedFinanceEvents.length ? allowedFinanceEvents : permissions?.module_permissions?.['event-mgmt']?.allowedEvents || [];
    if (!platform && !allowedEvents.length && financePermission?.allowedTabs && !financePermission.allowedTabs.includes('events')) {
      return <AccessRequired title="Event finance">Event finance access is required for this workspace.</AccessRequired>;
    }
    const eventId = Number(new URLSearchParams(location.search).get('event'));
    const initialEventId = Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null;
    return (
      <FinanceSurface>
        <EventFinance key={key} allowedEvents={allowedEvents} initialEventId={initialEventId} scopeId={scopeId} />
      </FinanceSurface>
    );
  }
  return <FinanceSurface><FinanceManager key={key} initialTab={page === 'payments' ? 'transactions' : 'dashboard'} /></FinanceSurface>;
}

export function CurrentLicences({ session, permissions, scopeId = 'all', refreshRevision = 0 }) {
  const location = useLocation();
  const navigate = useNavigate();
  if (!session?.user?.id || !(permissions?.role === 'super_admin' || permissions?.allowed_tabs?.includes('licenses'))) {
    return <AccessRequired title="Licences">Licences access is required.</AccessRequired>;
  }
  if (scopeId !== 'all') {
    return <AccessRequired title="Licences">Select your account workspace to manage licences.</AccessRequired>;
  }

  const search = new URLSearchParams(location.search);
  const playerId = search.get('license_player') || search.get('player');
  const playerHref = id => {
    const params = new URLSearchParams(search);
    params.delete('player');
    params.delete('license_player');
    if (id) params.set('license_player', String(id));
    const query = params.toString();
    return `${location.pathname}${query ? `?${query}` : ''}`;
  };
  const navigation = {
    playerId,
    playerHref,
    openPlayer: id => navigate(playerHref(id)),
    closePlayer: () => navigate(playerHref(null), { replace: true }),
  };

  return <FinanceSurface><LicenceManager key={`${session.user.id}:${refreshRevision}`} navigation={navigation} /></FinanceSurface>;
}
