import SearchableDropdown from "../components/SearchableDropdown";
import EventParticipantsWorkspace from "./admin-preview/EventParticipantsWorkspace.jsx";
import EventDetailsDialog from "./admin-preview/EventEditingDialog.jsx";
import EventCancellationDialog from "./admin-preview/EventCancellationDialog.jsx";
import EventPairDialog from "./admin-preview/EventPairDialog.jsx";
import EventTeamManagementDialog from "./admin-preview/EventTeamManagementDialog.jsx";
import EventCompletionControl from "./admin-preview/EventCompletionControl.jsx";
import { eligibleRegistrationTeamPartners, findRegistrationTeammate } from "./admin-preview/registrationTeamManagement.js";
import { loadManagedEventCompletions, managedEventStage } from "./admin-preview/eventManagementCompletion.js";
import { verifyEventOperationAccess } from "./admin-preview/eventOperationAccess.js";
import EventRankedinDialog from "./admin-preview/EventRankedinDialog.jsx";
import { isAvailableSolo } from "../utils/pairEventEntries.js";
import EventRemovalDialog from "./admin-preview/EventRemovalDialog.jsx";
import EventMoveDialog from "./admin-preview/EventMoveDialog.jsx";
import EventTeamDivisions from './admin-preview/EventTeamDivisions.jsx';
import { groupTeamDivisions } from './admin-preview/teamDivisions.js';
import { saveEventEntry } from './admin-preview/saveEventEntry';
import EventEntryForm from './admin-preview/EventEntryForm.jsx';
import EventPaymentDialog from './admin-preview/EventPaymentDialog.jsx';
import RecordLoading from './admin-preview/RecordLoading.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion as Motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, ArrowRight, Banknote, Bell, Building2, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Clock3,
  Command, CreditCard, Download, ExternalLink, FileText, Filter, GalleryVerticalEnd,
  LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Mail, MapPin, Menu, MessageSquare,
  MoreHorizontal, Network, Plus, Radio, RefreshCw, Search, Settings2, ShieldCheck,
  Trophy, UserPlus, FileSpreadsheet, Shuffle, Trash2, Link2,
  Users, WalletCards, X, Zap, Info, RotateCcw,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import AccessWorkspace from './admin-preview/AccessWorkspace';
import { canReadPreviewEvents, restrictPreviewEvents, previewScopes } from './admin-preview/access';
import {
  findPaymentForRegistration, getRegistrationEntryFeePaid,
  isEntryFeeRefund, isExplicitAdminMarkedPayment, isLicensePaymentRow, isCompedEntryPayment, hasBlockingProcessedRefund, normalizePaymentMetadata,
  isPaystackPaymentMethod, registrationCountsAsPaid, registrationHasPaystackEntryPayment,
  registrationIsCompedEntry, resolveRegistrationPaymentMethod, resolveRegistrationPayer,
} from '../utils/paymentRegistrationMatch';
import { resolveRegistrationLicenseCategory } from '../utils/registrationLicense';
import { buildPlayersByEmailMap } from '../utils/playerLookup';
import { readEventProfiles } from './admin-preview/eventSnapshots';
import { hydrateEventLicenses } from './admin-preview/eventLicenseData.js';
import EventPlayerAvatar from './admin-preview/EventPlayerAvatar';
import { incomePayments, ledgerRegistrations, sessionIdentity } from './admin-preview/eventLedger';
import './AdminPreview.css';
import './admin-preview/TeamDetails.css';
import PlayersWorkspace from './admin-preview/PlayersWorkspace';
import CalendarWorkspace from './admin-preview/CalendarWorkspace';
import CoachesWorkspace from './admin-preview/CoachesWorkspace';
import { tierTone } from './admin-preview/calendarData';
import EventManagerDashboard from './admin-preview/EventManagerDashboard';
import { readAll } from './admin-preview/playersData';
import { activeEventEntries } from './admin-preview/eventManagerData';
import AdminLogin from '../components/admin/AdminLogin';
import FinanceOverview from './admin-preview/FinanceOverview.jsx';
import PaymentsWorkspace from './admin-preview/PaymentsWorkspace.jsx';
import PayoutsWorkspace from './admin-preview/PayoutsWorkspace.jsx';
import ClubsWorkspace from './admin-preview/ClubsWorkspace.jsx';
import OrganisationsWorkspace from './admin-preview/OrganisationsWorkspace.jsx';
import FederationsWorkspace from './admin-preview/FederationsWorkspace.jsx';
import GalleryWorkspace from './admin-preview/GalleryWorkspace.jsx';
import EmailBroadcastWorkspace from './admin-preview/EmailBroadcastWorkspace.jsx';
import LicensesWorkspace from './admin-preview/LicensesWorkspace.jsx';
import TournamentAdminWorkspace from './admin-preview/TournamentAdminWorkspace.jsx';
import EventRecordState from './admin-preview/EventRecordState.jsx';
import EventAttentionList from './admin-preview/EventAttentionList.jsx';
import { isSoloTeam } from './admin-preview/soloEntries.js';

const PREVIEW_EVENT = {
  id: 'preview-cape-town-open', event_name: 'Cape Town Open', city: 'Cape Town',
  venue: 'Atlantic Padel Club', start_date: '2026-09-18', end_date: '2026-09-20',
  is_visible: true, organisation_id: 'preview-org', registration_closes_at: '2026-09-14',
  entry_fee: 750, capacity: 96,
};

const PREVIEW_EVENTS = [
  PREVIEW_EVENT,
  { id: 'preview-joburg-cup', event_name: 'Johannesburg Padel Cup', city: 'Johannesburg', venue: 'Morningside Arena', start_date: '2026-09-26', end_date: '2026-09-28', is_visible: true, entry_fee: 650, capacity: 128 },
  { id: 'preview-garden-route', event_name: 'Garden Route Masters', city: 'George', venue: 'Outeniqua Padel', start_date: '2026-10-04', end_date: '2026-10-05', is_visible: false, entry_fee: 700, capacity: 64 },
  { id: 'preview-winelands', event_name: 'Winelands Social', city: 'Stellenbosch', venue: 'Winelands Padel', start_date: '2026-10-11', end_date: '2026-10-11', is_visible: true, entry_fee: 420, capacity: 48 },
];

const PREVIEW_REGISTRATIONS = [
  { id: 'REG-1298', event_id: PREVIEW_EVENT.id, name: 'Aisha Daniels', email: 'aisha@example.com', partner_name: 'Sarah Adams', division: 'Women’s open', payment_status: 'failed', status: 'reserved', created_at: '2026-09-03T06:14:00Z', amount: 1500, player_id: 'player-aisha' },
  { id: 'REG-1297', event_id: PREVIEW_EVENT.id, name: 'Liam Jacobs', email: 'liam@example.com', partner_name: 'Ethan Ross', division: 'Men’s open', payment_status: 'paid', status: 'approved', created_at: '2026-09-03T05:42:00Z', amount: 1500, player_id: 'player-liam' },
  { id: 'REG-1296', event_id: PREVIEW_EVENT.id, name: 'Zoe Naidoo', email: 'zoe@example.com', partner_name: 'Mia Botha', division: 'Women’s 40+', payment_status: 'paid', status: 'needs_review', created_at: '2026-09-02T14:20:00Z', amount: 1500, player_id: 'player-zoe' },
  { id: 'REG-1295', event_id: PREVIEW_EVENT.id, name: 'Noah Williams', email: 'noah@example.com', partner_name: '', division: 'Men’s open', payment_status: 'pending', status: 'incomplete', created_at: '2026-09-02T10:05:00Z', amount: 750, player_id: 'player-noah' },
  { id: 'REG-1294', event_id: PREVIEW_EVENT.id, name: 'Kian Petersen', email: 'kian@example.com', partner_name: 'Musa Nkosi', division: 'Men’s 40+', payment_status: 'paid', status: 'approved', created_at: '2026-09-01T15:12:00Z', amount: 1500, player_id: 'player-kian' },
  { id: 'REG-1293', event_id: PREVIEW_EVENT.id, name: 'Amara Molefe', email: 'amara@example.com', partner_name: 'Leila Khan', division: 'Women’s open', payment_status: 'pending', status: 'needs_review', created_at: '2026-09-01T09:34:00Z', amount: 1500, player_id: 'player-amara' },
];
const PRETORIA_FINANCE_SNAPSHOT = {
  totalEntries: 100, uniquePlayers: 98, billed: 68950, grossCollected: 68300,
  entryRefunds: 8950, netEntryIncome: 59350, outstanding: 650, paid4M: 93,
  paidManual: 6, pending: 1, comped: 0, fullLicences: 57, tempLicences: 41,
  noLicences: 0, commission: 3415, interimPaid: 55935, balanceDue: 0,
};
const EMPTY_RELATED = { payments: [], divisions: [], activity: [], draws: [], refunds: [] };
const REGISTRATION_PAGE_SIZE = 50;
const RECORD_WORKSPACE_PAGES = ['players', 'calendar', 'coaches', 'clubs', 'organisations', 'federations', 'reports', 'payments', 'payouts', 'team-access', 'gallery', 'email', 'licenses', 'tournaments'];
const REFRESH_WORKSPACE_PAGES = RECORD_WORKSPACE_PAGES;

const WORKSPACES = [
  { id: 'operate', label: 'Operate', icon: Zap, caption: 'Run events', items: [
    { label: 'Dashboard', icon: LayoutDashboard, page: 'home' },
    { label: 'Event manager', icon: Trophy, page: 'events', activePages: ['events', 'event'] },
    { label: 'Tournament Manager', icon: Trophy, page: 'tournaments' },
    { label: 'Registrations', icon: FileText, page: 'registrations', activePages: ['registrations', 'payment', 'player'] },
    { label: 'Calendar', icon: CalendarDays, page: 'calendar' },
  ] },
  { id: 'network', label: 'Network', icon: Network, caption: 'People and places', items: [
    { label: 'Federations', icon: Network, page: 'federations' },
    { label: 'Organisations', icon: Building2, page: 'organisations' },
    { label: 'Clubs', icon: MapPin, page: 'clubs' },
    { label: 'Players', icon: Users, page: 'players' },
    { label: 'Coaches', icon: UserPlus, page: 'coaches' },
  ] },
  { id: 'money', label: 'Money', icon: WalletCards, caption: 'Payments and reporting', items: [
    { label: 'Payments', icon: CreditCard, page: 'payments' },
    { label: 'Licences', icon: ShieldCheck, page: 'licenses' },
    { label: 'Payouts', icon: Banknote, page: 'payouts' },
    { label: 'Finance reports', icon: FileSpreadsheet, page: 'reports' },
  ] },
  { id: 'publish', label: 'Publish', icon: GalleryVerticalEnd, caption: 'Audience and content', items: [
    { label: 'Gallery', icon: GalleryVerticalEnd, page: 'gallery' },
    { label: 'Email broadcast', icon: Mail, page: 'email' },
    { label: 'Blog', icon: FileText, page: 'blog' },
  ] },
  { id: 'system', label: 'System', icon: Settings2, caption: 'Access and configuration', items: [
    { label: 'Access & permissions', icon: ShieldCheck, page: 'team-access' },
    { label: 'Integrations', icon: Link2, page: 'integrations' },
    { label: 'Settings', icon: Settings2, page: 'settings' },
    { label: 'Audit log', icon: Clock3, page: 'audit-log' },
  ] },
];

const formatMoney = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(new Date(`${value}`.slice(0, 10) + 'T12:00:00')) : 'Date to confirm';
const eventName = (event) => String(event?.event_name || event?.title || 'Untitled event').trim();
const personName = (row) => row?.full_name || row?.name || row?.player_name || row?.email?.split('@')[0] || 'Unnamed player';
const registrationDivision = (row) => row?.division || row?.division_name || row?.category || 'Open division';
const displayValue = (value, fallback = '') => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => displayValue(item)).filter(Boolean).join(', ') || fallback;
  if (typeof value === 'object') {
    const preferred = [
      value.player_name && `Player: ${displayValue(value.player_name)}`,
      value.division && `Division: ${displayValue(value.division)}`,
      value.player_email && `Email: ${displayValue(value.player_email)}`,
      value.message && displayValue(value.message),
      value.description && displayValue(value.description),
    ].filter(Boolean);
    if (preferred.length) return preferred.join(' · ');
    return Object.entries(value).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${displayValue(item)}`).join(' · ') || fallback;
  }
  return fallback;
};
const registrationEligibility = (row) => {
  const license = String(row?._licenseCategory || '').toLowerCase();
  if (license === 'full') return { label: 'Full licence', tone: 'positive' };
  if (license === 'temp') return { label: 'Temporary licence', tone: 'info' };
  if (license === 'none') return { label: 'No licence', tone: 'danger' };
  return { label: 'Not available', tone: 'neutral' };
};

const activityTone = (category) => {
  const value = String(category || '').toLowerCase();
  if (value.includes('payment')) return 'payment';
  if (value.includes('finance')) return 'neutral';
  if (value.includes('player')) return 'amber';
  if (value.includes('admin')) return 'violet';
  if (value.includes('draw')) return 'info';
  if (value.includes('registration')) return 'processed';
  return 'neutral';
};
const normalizePayment = (row) => {
  const value = String(row?.payment_status || row?.status || 'pending').toLowerCase();
  if (['paid', 'success', 'successful', 'complete'].includes(value)) return 'paid';
  if (['failed', 'declined', 'abandoned'].includes(value)) return 'failed';
  return 'pending';
};
const eventPhase = (event) => {
  const today = new Date();
  const start = event?.start_date ? new Date(`${String(event.start_date).slice(0, 10)}T00:00:00`) : null;
  const end = event?.end_date ? new Date(`${String(event.end_date).slice(0, 10)}T23:59:59`) : start;
  if (end && end < today) return { label: 'Completed', tone: 'neutral', stage: 'close' };
  if (start && start <= today && (!end || end >= today)) return { label: 'Live', tone: 'positive', stage: 'run' };
  return { label: event?.is_visible ? 'Scheduled' : 'Draft', tone: event?.is_visible ? 'positive' : 'neutral', stage: 'plan' };
};
const readinessFor = (event, regs = []) => {
  const eventRegs = regs.filter((row) => String(row.event_id) === String(event.id));
  if (!event.is_visible) return { label: 'Draft', tone: 'neutral' };
  if (eventPhase(event).stage === 'close') {
    if (eventRegs.some((row) => normalizePayment(row) === 'failed')) return { label: 'Closed with issues', tone: 'danger' };
    return { label: 'Completed', tone: 'neutral' };
  }
  if (eventRegs.some((row) => normalizePayment(row) === 'failed')) return { label: 'Needs attention', tone: 'danger' };
  if (eventRegs.length === 0) return { label: 'Ready to open', tone: 'warning' };
  return { label: 'On track', tone: 'positive' };
};

function usePreviewData(session, permissions, forceFixture = false, focusEventId = null, publicLive = false, scope = null) {
  const identity = sessionIdentity(session);
  const request = useRef(0);
  const accessKey = `${identity}|${JSON.stringify(permissions)}|${scope?.id}|${focusEventId}|${forceFixture}`;
  const [state, setState] = useState({ events: [], registrations: [], players: [], ...EMPTY_RELATED, loading: true, error: null, source: 'live' });
  const load = useCallback(async () => {
    const version = ++request.current;
    const publish = next => { if (request.current === version) setState({ ...next, accessKey }); };
    if (!identity || !permissions) return;
    if (forceFixture) {
      publish({ events: PREVIEW_EVENTS, registrations: PREVIEW_REGISTRATIONS, players: [], ...EMPTY_RELATED, loading: false, error: null, source: 'preview' });
      return;
    }
    publish({ events: [], registrations: [], players: [], ...EMPTY_RELATED, loading: true, error: null });
    try {
      if (!canReadPreviewEvents(permissions)) throw new Error('Event Manager access is required.');
      if (!isSupabaseConfigured()) throw new Error('Supabase is not configured for this local preview.');
      const eventFields = '*, organisations:organisation_id(id,name,slug), clubs:club_id(id,name,short_name,slug)';
      const events = await readAll(() => {
        let query = supabase.from('calendar').select(eventFields).order('id');
        if (focusEventId) query = query.eq('id', focusEventId);
        return restrictPreviewEvents(query, permissions, scope);
      });
      if (focusEventId && !events?.length) throw new Error('This event is not available in your admin scope.');
      const eventIds = (events || []).map((event) => event.id);
      let registrations = [];
      if (eventIds.length) {
        const registrationSource = publicLive ? 'event_registrations_public' : 'event_registrations';
        for (let offset = 0; offset < eventIds.length; offset += 50) {
          const ids = eventIds.slice(offset, offset + 50);
          registrations.push(...await readAll(() => supabase.from(registrationSource).select('*').in('event_id', ids).order('id')));
        }
      }
      let payments = [];
      let divisions = [];
      let activity = [];
      let draws = [];
      let refunds = [];
      if (focusEventId) {
        const [paymentResult, divisionResult, activityResult, drawResult] = await Promise.all([
          publicLive ? [] : readAll(() => supabase.from('payments').select('*').eq('event_id', focusEventId).order('id')),
          readAll(() => supabase.from('tournament_divisions').select('*').eq('event_id', focusEventId).order('id')),
          publicLive ? [] : readAll(() => supabase.from('event_activity_log').select('*').eq('event_id', focusEventId).order('id')),
          readAll(() => supabase.from('draws').select('id, division_id, draw_kind, format, status, generated_at, public_announcement, tournament_divisions(name)').eq('event_id', focusEventId).order('id')),
        ]);
        payments = paymentResult;
        divisions = divisionResult;
        activity = activityResult.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        draws = drawResult;
        if (!publicLive && payments.length) {
          for (let offset = 0; offset < payments.length; offset += 50) {
            const ids = payments.slice(offset, offset + 50).map(payment => payment.id);
            refunds.push(...await readAll(() => supabase.from('payment_refunds').select('*').in('payment_id', ids).order('id')));
          }
        }
      }
      const emails = [...new Set(registrations.flatMap((row) => [row.email, row.partner_email]).filter(Boolean))];
      let players = [];
      if (emails.length && !publicLive && focusEventId) {
        players = await readEventProfiles(supabase, emails);
        players = await hydrateEventLicenses(supabase, players, focusEventId);
      }
      const playerByEmail = buildPlayersByEmailMap(players);
      const enrichedRegistrations = registrations.map((registration) => {
        const player = playerByEmail.get(String(registration.email || '').toLowerCase().trim()) || null;
        return {
          ...registration,
          _player: player,
          _partnerPlayer: playerByEmail.get(String(registration.partner_email || '').toLowerCase().trim()) || null,
          _licenseCategory: !publicLive && registration.email
            ? resolveRegistrationLicenseCategory(registration.email, registration.event_id, player, payments)
            : null,
        };
      });
      publish({ events: events || [], registrations: enrichedRegistrations, players, payments, divisions, activity, draws, refunds, loading: false, error: null, source: 'live' });
    } catch (error) {
      console.warn('Admin preview data load failed:', error);
      publish({ events: [], registrations: [], players: [], ...EMPTY_RELATED, loading: false, error: error.message, source: 'error' });
    }
  }, [identity, permissions, forceFixture, focusEventId, publicLive, scope, accessKey]);
  useEffect(() => { load(); return () => { request.current += 1; }; }, [load]);
  return { ...(state.accessKey === accessKey ? state : { events: [], registrations: [], players: [], ...EMPTY_RELATED, loading: true, error: null }), reload: load };
}

const ScreenReaderStatus = ({ children }) => <div className="ap-sr-status" role="status" aria-live="polite">{children}</div>;

function Status({ tone = 'neutral', children }) {
  return <span className={`ap-status ap-status--${tone}`}>{children}</span>;
}

function PreviewTag() {
  return <span className="ap-preview-tag" title="Connected actions can save live records. Each module identifies actions that remain previews."><LockKeyhole size={12} aria-hidden="true" /> Admin preview</span>;
}

function LoginGate({ onSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!isSupabaseConfigured()) {
      setError('Local Supabase configuration is missing. Restart the preview server after adding .env.local.');
      return;
    }
    setBusy(true); setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) setError(authError.message); else onSession(data.session);
    } catch {
      setError('The sign-in service could not be reached. Check your connection and try again.');
    } finally { setBusy(false); }
  };
  return <AdminLogin preview email={email} password={password} onEmail={event => setEmail(event.target.value)} onPassword={event => setPassword(event.target.value)} onSubmit={submit} busy={busy} error={error} />;
}

function Sidebar({ activeWorkspace, setActiveWorkspace, page, go, open, setOpen, session }) {
  const navigate = useNavigate();
  const accountId = session?.user?.id;
  const accountEmail = session?.user?.email || '';
  const [accountProfile, setAccountProfile] = useState(null);
  const [failedPhoto, setFailedPhoto] = useState(null);
  useEffect(() => {
    if (!accountId || !accountEmail) return;
    const controller = new AbortController();
    const emailFilter = accountEmail.trim().replace(/[\\%_]/g, '\\$&');
    supabase.from('players').select('name,image_url').ilike('email', emailFilter).maybeSingle().abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (!controller.signal.aborted) setAccountProfile({ accountId, email: accountEmail, profile: error ? null : data });
      }).catch(() => { /* The account remains usable with its initials fallback. */ });
    return () => controller.abort();
  }, [accountId, accountEmail]);
  const profile = accountProfile?.accountId === accountId && accountProfile?.email === accountEmail ? accountProfile.profile : null;
  const accountName = profile?.name || accountEmail.split('@')[0] || 'Admin';
  const photo = profile?.image_url;
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setOpen(false);
      navigate('/admin', { replace: true });
    } catch {
      setLogoutError('Could not log out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };
  const openDestination = (_workspaceId, item) => {
    go(item.page);
    setOpen(false);
  };
  return (
    <>
      <AnimatePresence>{open && <Motion.button className="ap-sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}</AnimatePresence>
      <aside className={`ap-sidebar ${open ? 'is-open' : ''}`} aria-label="Admin workspaces">
        <div className="ap-brand"><strong>4M</strong><span>PADEL</span><small>Admin</small></div>
        <nav className="ap-sidebar-nav">
          <p className="ap-nav-label">Workspaces</p>
          <LayoutGroup id="workspaces">{WORKSPACES.map(({ id, label, icon: Icon, caption, items }) => (
            <section className={`ap-nav-group ${activeWorkspace === id ? 'is-active' : ''}`} key={id}>
              <button className="ap-workspace-heading" onClick={() => { setActiveWorkspace(id); if (id === 'operate') go('home'); setOpen(false); }} aria-expanded="true">
                {React.createElement(Icon, { size: 16, 'aria-hidden': true })}<span><b>{label}</b><small>{caption}</small></span>
              </button>
              <div className="ap-nav-destinations">{items.map((item) => {
                const ItemIcon = item.icon;
                const activePages = item.activePages || [item.page];
                const isActive = activeWorkspace === id && activePages.includes(page);
                return <button key={item.label} className={`ap-nav-destination ${isActive ? 'is-active' : ''}`} onClick={() => openDestination(id, item)}>
                  {isActive && <Motion.span className="ap-workspace-active" layoutId="workspace-active" transition={{ type: 'spring', duration: .28, bounce: 0 }} />}
                  <ItemIcon size={15} aria-hidden="true" /><span>{item.label}</span>
                </button>;
              })}</div>
            </section>
          ))}</LayoutGroup>
        </nav>
        <div className="ap-sidebar-account">
          <div className="ap-avatar">{photo && failedPhoto !== photo ? <img src={photo} alt="" width={32} height={32} onError={() => setFailedPhoto(photo)} /> : accountName.slice(0, 1).toUpperCase()}</div>
          <span><b title={accountName}>{accountName}</b><small>Operations team</small></span>
          <a href="/admin" aria-label="Open current admin"><ExternalLink size={16} /></a>
        </div>
        <button className="ap-logout" onClick={logout} disabled={loggingOut} aria-label={loggingOut ? 'Logging out' : 'Log out'} title="Log out of this browser">
          {loggingOut ? <LoaderCircle size={16} className="ap-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}<span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
        </button>
        {logoutError && <p className="ap-logout-error" role="alert">{logoutError}</p>}
      </aside>
    </>
  );
}

function ScopeSwitcher({ scopes, scope, setScope }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <div className="ap-scope" ref={ref}>
    <button className="ap-scope-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="listbox"><Building2 size={17} /><span><small>Working in</small><b>{scope.label}</b></span><ChevronDown size={16} /></button>
    <AnimatePresence>{open && <Motion.div className="ap-scope-menu" role="listbox" aria-label="Organisation or club scope" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .14 }}>
      {scopes.map((item) => <button role="option" aria-selected={item.id === scope.id} key={item.id} onClick={() => { setScope(item); setOpen(false); }}><span><b>{item.label}</b><small>{item.type}</small></span>{item.id === scope.id && <Check size={16} />}</button>)}
    </Motion.div>}</AnimatePresence>
  </div>;
}

function CommandPalette({ open, onClose, events, registrations, go }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const commands = useMemo(() => [
    { id: 'overview', label: 'Open operations overview', type: 'Go to', icon: LayoutDashboard, run: () => go('home') },
    { id: 'events', label: 'Browse all events', type: 'Go to', icon: CalendarDays, run: () => go('events') },
    { id: 'regs', label: 'Review registrations', type: 'Go to', icon: FileText, run: () => go('registrations') },
    ...events.slice(0, 8).map((item) => ({ id: `event-${item.id}`, label: item.event_name || item.title || 'Untitled event', type: 'Event', icon: CalendarDays, run: () => go('event', { event: item }) })),
    ...registrations.slice(0, 8).map((item) => ({ id: `reg-${item.id}`, label: `${personName(item)}, ${item.id}`, type: 'Registration', icon: Users, run: () => go('registrations', { registration: item }) })),
  ], [events, registrations, go]);
  const results = commands.filter((item) => `${item.label} ${item.type}`.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
  return <AnimatePresence>{open && <Motion.div className="ap-command-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <button className="ap-command-dismiss" aria-label="Close command palette" onClick={onClose} />
    <Motion.div className="ap-command" role="dialog" aria-modal="true" aria-label="Search and commands" initial={{ opacity: 0, y: -12, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .99 }} transition={{ type: 'spring', duration: .28, bounce: 0 }}>
      <div className="ap-command-input"><Search size={20} /><label className="ap-visually-hidden" htmlFor="admin-command-search">Search records and actions</label><input ref={inputRef} id="admin-command-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events, players, registrations…" /><kbd>ESC</kbd></div>
      <div className="ap-command-results">
        {results.length ? results.map(({ id, label, type, icon: Icon, run }) => <button key={id} onClick={() => { run(); onClose(); }}>{React.createElement(Icon, { size: 17 })}<span><b>{label}</b><small>{type}</small></span><ArrowRight size={15} /></button>) : <div className="ap-empty-compact"><Search size={22} /><b>No matching records</b><span>Try a player, event or registration name.</span></div>}
      </div>
      <div className="ap-command-foot"><span><kbd>↵</kbd> Open</span><span><kbd>Tab</kbd> Navigate</span><span>Preview search includes loaded records</span></div>
    </Motion.div>
  </Motion.div>}</AnimatePresence>;
}

function Topbar({ onMenu, scopes, scope, setScope, onCommand, onReload }) {
  return <header className="ap-topbar">
    <button className="ap-icon-button ap-mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
    <ScopeSwitcher scopes={scopes} scope={scope} setScope={setScope} />
    <button className="ap-search-button" onClick={onCommand}><Search size={18} /><span>Search players, clubs, events…</span><kbd><Command size={11} />K</kbd></button>
    <div className="ap-top-actions">
      <PreviewTag />
      <button className="ap-icon-button" onClick={onReload} aria-label="Reload live data"><RefreshCw size={17} /></button>
      <button className="ap-icon-button" aria-label="Open notifications"><Bell size={18} /><span className="ap-notification-dot" /></button>
      <button className="ap-primary ap-create" title="Actions are disabled in this read-only preview"><Plus size={18} /> Create</button>
    </div>
  </header>;
}

const PageHeading = ({ eyebrow, title, description, children }) => <div className="ap-page-heading"><div><p className="ap-eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="ap-lede">{description}</p>}</div>{children && <div className="ap-heading-actions">{children}</div>}</div>;

function AttentionRow({ item, go }) {
  const Icon = item.type === 'payment' ? CreditCard : item.type === 'registration' ? FileText : item.type === 'event' ? CalendarDays : ShieldCheck;
  return <Motion.button layout className="ap-attention-row" onClick={() => go(item.target, item.payload)} whileTap={{ scale: .96 }} transition={{ duration: .12 }}>
    <span className={`ap-row-icon is-${item.tone}`}><Icon size={18} /></span>
    <span className="ap-row-primary"><b>{item.title}</b><small>{item.detail}</small></span>
    <span className="ap-row-event">{item.context}</span><span className="ap-row-age">{item.age}</span><Status tone={item.tone}>{item.priority}</Status><ChevronRight size={17} />
  </Motion.button>;
}

function OperationsHome({ events, registrations, go, userName }) {
  const failures = registrations.filter((row) => normalizePayment(row) === 'failed');
  const pending = registrations.filter((row) => ['needs_review', 'pending', 'incomplete'].includes(String(row.status || '').toLowerCase()));
  const draftEvent = events.find((event) => !event.is_visible);
  const attention = [
    ...failures.slice(0, 2).map((row) => ({ id: `fail-${row.id}`, type: 'payment', title: 'Recover declined payment', detail: `${personName(row)}, ${registrationDivision(row)}`, context: events.find((event) => String(event.id) === String(row.event_id))?.event_name || 'Event registration', age: '2h', priority: 'High', tone: 'danger', target: 'payment', payload: { registration: row } })),
    ...pending.slice(0, 2).map((row) => ({ id: `reg-${row.id}`, type: 'registration', title: 'Review registration', detail: `${personName(row)}, ${registrationDivision(row)}`, context: events.find((event) => String(event.id) === String(row.event_id))?.event_name || 'Event registration', age: '5h', priority: 'Medium', tone: 'warning', target: 'registrations', payload: { registration: row } })),
    ...(draftEvent ? [{ id: `event-${draftEvent.id}`, type: 'event', title: 'Finish event readiness', detail: 'Pricing and publish checks remain', context: draftEvent.event_name, age: '1d', priority: 'Medium', tone: 'warning', target: 'event', payload: { event: draftEvent } }] : []),
  ];
  const paid = registrations.filter((row) => normalizePayment(row) === 'paid');
  const paidValue = paid.reduce((sum, row) => sum + Number(row.amount || row.entry_fee || 0), 0);
  const upcoming = events.slice(0, 4);
  return <>
    <PageHeading eyebrow="Operations" title={`Good morning, ${userName}.`} description="Start with the records that need a decision."><button className="ap-secondary" onClick={() => go('events')}><CalendarDays size={17} /> All events</button></PageHeading>
    <section className="ap-metric-rail" aria-label="Operations summary">
      <div><span>Upcoming events</span><strong>{events.length}</strong><small>Loaded in your scope</small></div>
      <div><span>Registrations</span><strong>{registrations.length}</strong><small>{pending.length} need review</small></div>
      <div><span>Paid entries</span><strong>{paid.length}</strong><small>{formatMoney(paidValue)} captured</small></div>
      <div className={failures.length ? 'is-risk' : ''}><span>Payment issues</span><strong>{failures.length}</strong><small>{failures.length ? 'Open recovery queue' : 'No exceptions'}</small></div>
    </section>
    <div className="ap-home-grid">
      <section className="ap-section ap-attention">
        <div className="ap-section-heading"><div><p className="ap-kicker">Work queue</p><h2>Needs attention</h2></div><span className="ap-section-count">{attention.length} open</span></div>
        <div className="ap-table-labels"><span>Next action</span><span>Event</span><span>Age</span><span>Priority</span><span /></div>
        <LayoutGroup>{attention.length ? attention.map((item) => <AttentionRow key={item.id} item={item} go={go} />) : <div className="ap-empty"><CheckCircle2 size={28} /><h3>Your queue is clear</h3><p>No payment exceptions or registrations need review.</p><button className="ap-secondary" onClick={() => go('events')}>Review event readiness</button></div>}</LayoutGroup>
      </section>
      <aside className="ap-section ap-today">
        <div className="ap-section-heading"><div><p className="ap-kicker">Next up</p><h2>Upcoming events</h2></div><button className="ap-text-button" onClick={() => go('events')}>View all <ArrowRight size={15} /></button></div>
        <ol>
          {upcoming.map((event) => <li key={event.id}><time>{formatDate(event.start_date, { year: undefined })}</time><button onClick={() => go('event', { event })}><b>{event.event_name || event.title || 'Untitled event'}</b><small>{event.venue || event.city || 'Venue to confirm'}</small></button></li>)}
        </ol>
      </aside>
    </div>
  </>;
}


function EventHeader({ event, registrations, activeTab, setActiveTab, go, showFinancials = true, financialTotal = null, financialLabel = 'captured' }) {
  const eventRegs = registrations.filter((row) => String(row.event_id) === String(event.id)); const readiness = readinessFor(event, registrations);
  const phase = eventPhase(event);
  const hasFailedPayment = eventRegs.some((row) => normalizePayment(row) === 'failed');
  const primaryTarget = phase.stage === 'close' ? 'registrations' : hasFailedPayment ? 'payment' : 'registrations';
  const primaryLabel = phase.stage === 'close' ? 'Open registrations' : hasFailedPayment ? 'Resolve payment' : 'Review registrations';
  const tabs = ['Overview', 'Registrations', 'Finance', 'Schedule', 'Activity'];
  return <><div className="ap-event-context"><button className="ap-back-button" onClick={() => go('events')}><ArrowLeft size={17} /> Events</button><div><span>Operate / Events</span><h1>{eventName(event)}</h1><p><CalendarDays size={14} /> {formatDate(event.start_date)}{event.end_date && event.end_date !== event.start_date ? ` - ${formatDate(event.end_date, { year: undefined })}` : ''}<i /> <MapPin size={14} /> {event.venue || event.city || 'Venue to confirm'}</p></div><div className="ap-event-health"><Status tone={readiness.tone}>{readiness.label}</Status><strong>{eventRegs.length}<small> registrations</small></strong><strong>{showFinancials ? formatMoney(financialTotal ?? eventRegs.filter((row) => normalizePayment(row) === 'paid').reduce((sum, row) => sum + Number(row.amount || event.entry_fee || 0), 0)) : 'Private'}<small>{showFinancials ? financialLabel : 'finance'}</small></strong><button className="ap-primary" onClick={() => go(primaryTarget, { event })}>{primaryLabel} <ArrowRight size={16} /></button></div></div><div className="ap-record-tabs" role="tablist" aria-label="Event record sections">{tabs.map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} onClick={() => { if (tab === 'Registrations') go('registrations', { event }); else setActiveTab(tab); }}>{tab}{tab === 'Registrations' && <span>{eventRegs.length}</span>}</button>)}</div></>;
}

function EventCommandCentre({ event, registrations, go }) {
  const [tab, setTab] = useState('Overview'); const eventRegs = registrations.filter((row) => String(row.event_id) === String(event.id)); const failures = eventRegs.filter((row) => normalizePayment(row) === 'failed');
  const sections = {
    Overview: <div className="ap-command-centre-grid"><section className="ap-lifecycle"><div className="ap-section-heading"><div><p className="ap-kicker">Lifecycle</p><h2>Live operations</h2></div><Status tone="positive">Registration open</Status></div><div className="ap-life-track"><span className="is-done"><Check size={13} /></span><i className="is-done" /><span className="is-active">2</span><i /><span>3</span></div><div className="ap-life-labels"><span><b>Plan</b><small>Event setup complete</small></span><span><b>Run</b><small>Registrations & payments</small></span><span><b>Close</b><small>Results & settlement</small></span></div></section><section className="ap-readiness-list"><div className="ap-section-heading"><div><p className="ap-kicker">Readiness</p><h2>What remains</h2></div><strong>3 of 4</strong></div>{[['Event setup', true, 'Venue, divisions and pricing'], ['Registration health', !failures.length, failures.length ? `${failures.length} payment exception` : 'All entries healthy'], ['Schedule', false, 'Court allocation outstanding'], ['Finance', true, 'Payout details configured']].map(([label, done, detail]) => <button key={label}><span className={done ? 'is-done' : ''}>{done ? <Check size={14} /> : <Clock3 size={14} />}</span><span><b>{label}</b><small>{detail}</small></span><ChevronRight size={16} /></button>)}</section><section className="ap-section ap-operational-feed"><div className="ap-section-heading"><div><p className="ap-kicker">Live operations</p><h2>Registration health</h2></div><button className="ap-text-button" onClick={() => go('registrations', { event })}>Open workspace <ArrowRight size={15} /></button></div><div className="ap-health-grid"><div><strong>{eventRegs.length}</strong><span>Entries</span><small>{event.capacity ? `${event.capacity - eventRegs.length} places remain` : 'Capacity open'}</small></div><div><strong>{eventRegs.filter((row) => normalizePayment(row) === 'paid').length}</strong><span>Paid</span><small>Funds captured</small></div><div className={failures.length ? 'is-risk' : ''}><strong>{failures.length}</strong><span>Exceptions</span><small>{failures.length ? 'Action required' : 'All clear'}</small></div></div>{failures[0] && <button className="ap-inline-alert" onClick={() => go('payment', { registration: failures[0], event })}><AlertCircle size={19} /><span><b>Payment declined for {personName(failures[0])}</b><small>Registration remains reserved. Recover before the hold expires.</small></span><ArrowRight size={17} /></button>}</section><section className="ap-section ap-activity"><div className="ap-section-heading"><div><p className="ap-kicker">Latest changes</p><h2>Activity</h2></div><button className="ap-icon-button" aria-label="More activity options"><MoreHorizontal size={18} /></button></div><ol><li><span /><div><b>Registration submitted</b><small>{personName(eventRegs[0])}, Recently</small></div></li><li><span /><div><b>Payment received</b><small>{personName(eventRegs.find((row) => normalizePayment(row) === 'paid'))}, Recently</small></div></li><li><span /><div><b>Event details updated</b><small>Event record, Current configuration</small></div></li></ol></section></div>,
    Finance: <WorkspacePlaceholder icon={CircleDollarSign} title="Finance workspace" detail={`${formatMoney(eventRegs.filter((row) => normalizePayment(row) === 'paid').reduce((sum, row) => sum + Number(row.amount || event.entry_fee || 0), 0))} captured across ${eventRegs.length} registrations.`} />,
    Schedule: <WorkspacePlaceholder icon={CalendarDays} title="Schedule workspace" detail="Court allocation, match blocks and operational check-in will live in this event context." />,
    Activity: <WorkspacePlaceholder icon={Clock3} title="Complete activity trail" detail="Every registration, payment and event change is grouped into one chronological record." />,
  };
  return <><EventHeader event={event} registrations={registrations} activeTab={tab} setActiveTab={setTab} go={go} /><AnimatePresence mode="wait" initial={false}><Motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .16 }}>{sections[tab]}</Motion.div></AnimatePresence></>;
}

export function EventDemoModal({ action, event, divisions, onClose, onExport, onPaymentAction, onSaveEntry, onMove, onRemove, onPair, onMerge, onSplit, onEditDetails, onCancelScope }) {
  const closeRef = useRef(null);
  const [complete, setComplete] = useState(false);
  const [entryDraft, setEntryDraft] = useState(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const entrySaveAttempted = useRef(false);
  const closeEntry = () => { if (!entryBusy) onClose({ refresh: entrySaveAttempted.current }); };
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !entryBusy && onClose({ refresh: entrySaveAttempted.current });
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, entryBusy]);
  const registration = action?.registration;
  const titleByType = {
    note: 'Payment note',
    add: 'Add player or team', sync: 'Sync to RankedIn', export: 'Export event', payout: 'Request payout',
    move: 'Move registration', remove: 'Remove registration', draw: 'Draw details', team: 'Team details', settings: 'Event options',
  };
  const submit = (e) => { e.preventDefault(); setComplete(true); };
  return <Motion.div className="ap-modal-layer" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <button className="ap-modal-scrim" aria-label="Close dialog" disabled={entryBusy} onClick={closeEntry} />
    <Motion.section className={`ap-modal${action?.type === 'note' ? ' ap-note-modal' : action?.type === 'team' ? ' ap-team-details-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby="event-modal-title" initial={{ opacity: 0, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: .16 }}>
      <header><div><p className="ap-kicker">{eventName(event)}</p><h2 id="event-modal-title">{titleByType[action?.type] || 'Event action'}</h2></div><button ref={closeRef} className="ap-icon-button" disabled={entryBusy} onClick={closeEntry} aria-label="Close dialog"><X size={18} /></button></header>
      {complete ? <div className="ap-modal-success"><CheckCircle2 size={30} /><h3>{entryDraft?.saved ? 'Registration added — payment pending' : entryDraft ? 'Pending entry review' : 'Prototype action complete'}</h3>{entryDraft && <p>{entryDraft.players.map(player => player.name || player.email).join(' / ')} · {entryDraft.division.name || entryDraft.division.division_name} · {formatMoney(entryDraft.amountDue)} due{entryDraft.note && <small> · Note: {entryDraft.note}</small>}</p>}<p>{entryDraft?.saved ? 'Registration saved. Payment can be marked separately.' : 'No live event data was changed. This is a local preview only.'}</p>{entryDraft?.warnings?.map((warning,index)=><p role="status" key={index}>{warning}</p>)}<button className="ap-primary" onClick={closeEntry}>Done</button></div> : <div className="ap-modal-body">
        {action?.type === 'note' && <div className="ap-payment-note-content"><div className="ap-note-person"><EventPlayerAvatar player={registration?._player} name={personName(registration)} /><div><h3>{personName(registration)}</h3><small>{registrationDivision(registration)}</small></div>{registration?._paymentDisplay && <Status tone={registration._paymentDisplay.tone}>{registration._paymentDisplay.label}</Status>}</div><div className="ap-note-message"><Info size={16} aria-hidden="true" /><p>{displayValue(action.note, 'No payment note recorded.')}</p></div></div>}
        {action?.type === 'add' && <EventEntryForm divisions={divisions} save={onSaveEntry ? draft => { entrySaveAttempted.current = true; return onSaveEntry(draft); } : undefined} onBusy={setEntryBusy} onReview={draft => { setEntryDraft(draft); setComplete(true); }}/>}
        {action?.type === 'export' && <div className="ap-export-options"><button onClick={() => { onExport('registrations'); setComplete(true); }}><FileSpreadsheet size={21} /><span><b>Registration list</b><small>Players, partners, divisions, payment and licence status</small></span><Download size={16} /></button><button onClick={() => { onExport('finance'); setComplete(true); }}><CircleDollarSign size={21} /><span><b>Income statement</b><small>Event totals and the payment ledger currently available</small></span><Download size={16} /></button></div>}
        {action?.type === 'payout' && <form className="ap-demo-form" onSubmit={submit}><label>Payout amount<input required inputMode="decimal" defaultValue={action.amount || ''} /></label><label>Reference<input required defaultValue={`${eventName(event)} settlement`} /></label><label>Note<textarea defaultValue="Final event settlement after fees and previous payouts." /></label><div className="ap-form-note"><LockKeyhole size={16} /><span>A live request would require finance approval and a verified organiser bank account.</span></div><button className="ap-primary" type="submit">Submit demo request <ArrowRight size={16} /></button></form>}
        {action?.type === 'draw' && <div className="ap-action-review"><Status tone={action.draw?.status === 'completed' ? 'positive' : 'neutral'}>{action.draw?.status || 'Not generated'}</Status><dl className="ap-details-list"><div><dt>Division</dt><dd>{action.division?.name || action.division?.division_name}</dd></div><div><dt>Format</dt><dd>{action.draw?.format || action.division?.format || 'Knockout'}</dd></div><div><dt>Draw type</dt><dd>{action.draw?.draw_kind || 'Main draw'}</dd></div><div><dt>Generated</dt><dd>{action.draw?.generated_at ? formatDate(action.draw.generated_at) : 'Not recorded'}</dd></div></dl><p>Draw generation, publishing and result entry are not yet connected in this UI. The details above are read-only.</p></div>}
        {action?.type === 'team' && <div className="ap-action-review ap-team-modal">
          <div className="ap-team-modal-head"><div><p className="ap-kicker">{registrationDivision(registration)}</p><h3>{action.team.length > 1 ? `${personName(action.team[0])} / ${personName(action.team[1])}` : personName(registration)}</h3></div><Status tone={action.team.every((member) => member._paymentDisplay?.label === 'Paid') ? 'positive' : 'warning'}>{action.team.every((member) => member._paymentDisplay?.label === 'Paid') ? 'Team settled' : 'Needs attention'}</Status></div>
          <div className="ap-team-members">{action.team.map((member, index) => {
            const eligibility = registrationEligibility(member);
            const payment = member._paymentDisplay || { label: normalizePayment(member), tone: 'warning', detail: '' };
            return <article className="ap-team-member" key={member.id || `${personName(member)}-${index}`}><div className="ap-player-modal-title"><EventPlayerAvatar player={member._player} name={personName(member)} /><div><small>{index === 0 ? 'Player' : 'Partner'}</small><h3>{personName(member)}</h3><p>{member.email || 'Contact details protected'}</p></div></div><dl><div><dt>4M points</dt><dd>{Number(member._player?.points || member.points || 0).toLocaleString('en-ZA')}</dd></div><div><dt>Licence</dt><dd><Status tone={eligibility.tone}>{eligibility.label}</Status></dd></div><div><dt>Payment</dt><dd><Status tone={payment.tone}>{payment.label}</Status>{payment.detail && <small className={`ap-payment-source ap-payment-source--${payment.detailTone || 'neutral'}`}>{payment.detail}</small>}</dd></div><div><dt>Amount paid</dt><dd>{member._entryAmount == null ? 'Not available' : formatMoney(member._entryAmount)}</dd></div></dl>{onPaymentAction && <div className="ap-player-payment-actions">{!['Paid', 'Comped'].includes(payment.label) ? <><button className="ap-secondary" onClick={() => onPaymentAction(member, 'paid')}>Mark as paid</button><button className="ap-secondary" onClick={() => onPaymentAction(member, 'comp')}>Complimentary entry</button></> : member._canUnmark && <button className="ap-secondary" onClick={() => onPaymentAction(member, 'unmark')}>{payment.label === 'Comped' ? 'Remove comp' : 'Unmark manual payment'}</button>}</div>}</article>;
          })}</div>
          <div className="ap-team-totals"><span><small>Team points</small><b>{action.team.reduce((sum, member) => sum + Number(member._player?.points || member.points || 0), 0).toLocaleString('en-ZA')}</b></span><span><small>Entry fees paid</small><b>{action.team.some(member => member._entryAmount == null) ? 'Not available' : formatMoney(action.team.reduce((sum, member) => sum + Number(member._entryAmount), 0))}</b></span><span><small>Registration</small><b>{registration?.status || 'Registered'}</b></span></div>
          <div className="ap-modal-actions">{onMerge && <button className="ap-primary" onClick={() => onMerge(registration)}>Merge existing entries</button>}{onSplit && <button className="ap-secondary" onClick={() => onSplit(registration)}>Split team</button>}{onPair && <button className="ap-primary" onClick={() => onPair(registration)}><UserPlus size={15} /> Invite from directory</button>}{onMove && <button className="ap-secondary" onClick={() => onMove(action.team)}><Shuffle size={15} /> Move whole team</button>}{onRemove && <button className="ap-danger-button" onClick={() => onRemove(action.team)}><Trash2 size={15} /> Remove whole team</button>}</div>
        </div>}
        {action?.type === 'settings' && <div className="ap-export-options">{onEditDetails && <button onClick={onEditDetails}><Settings2 size={21} /><span><b>Edit event details</b><small>Event setup, schedule, registration and division settings</small></span><ChevronRight size={16} /></button>}<a className="ap-secondary" href={`/calendar/${encodeURIComponent(event.slug || event.id)}`} target="_blank" rel="noreferrer"><Link2 size={21} /> Open public event page <ExternalLink size={16} /></a>{onCancelScope && event.event_status !== "cancelled" && <><button className="ap-event-cancel-option" onClick={() => onCancelScope("division")}><Trash2 size={21}/><span><b>Cancel division</b><small>Close a division and refund eligible entries</small></span><ChevronRight size={16}/></button><button className="ap-event-cancel-option" onClick={() => onCancelScope("event")}><Trash2 size={21}/><span><b>Cancel event</b><small>Withdraw all entries and request eligible refunds</small></span><ChevronRight size={16}/></button></>}<p className="ap-table-foot">Player broadcasts and publishing workflows are not connected here.</p></div>}
      </div>}
    </Motion.section>
  </Motion.div>;
}

export function LiveEventCommandCentre({ event, registrations, payments, divisions, activity, draws = [], refunds = [], go, financeRestricted = false, canManagePayments = false, session, scopeId = 'all', client = supabase, onRefresh }) {
  const [tab, setTab] = useState('Overview');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const activityHeadingRef = useRef(null);
  const [action, setAction] = useState(null);
  const [paymentAction, setPaymentAction] = useState(null);
  const [moveAction, setMoveAction] = useState(null);
  const [removeAction, setRemoveAction] = useState(null);
  const [pairTarget, setPairTarget] = useState(null);
  const [teamOperation, setTeamOperation] = useState(null);
  const [operationAccess, setOperationAccess] = useState(false);
  const [completion, setCompletion] = useState({ loading: true });
  useEffect(() => {
    let alive = true; setOperationAccess(false); setCompletion({ loading: true });
    if (!session?.user?.id) { setCompletion({ loading: false }); return; }
    verifyEventOperationAccess({ client, eventId: event.id, expectedUserId: session.user.id, scopeId })
      .then(async () => { if (!alive) return; setOperationAccess(true); const map = await loadManagedEventCompletions(client); if (alive) setCompletion({ loading: false, value: map.get(Number(event.id)) || null }); })
      .catch(error => { if (alive) setCompletion({ loading: false, error: error.message }); });
    return () => { alive = false; };
  }, [client, event.id, session?.user?.id, scopeId]);
  const managedEvent = { ...event, management_completed_at: completion.value || null };
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelScope, setCancelScope] = useState(null);
  const [query, setQuery] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('All licences');
  const [divisionFilter, setDivisionFilter] = useState('All divisions');
  const rawActiveRegistrations = activeEventEntries(registrations);
  const usePretoriaSnapshot = financeRestricted && Number(event.id) === 463;
  // Aggregate screenshot totals cannot establish an individual player's licence.
  const activeRegistrations = rawActiveRegistrations;
  const divisionFeeFor = (row) => {
    const rowDivision = registrationDivision(row).toLowerCase();
    const division = divisions.find((item) => String(item.id) === String(row.division_id)
      || String(item.name || item.division_name || '').toLowerCase() === rowDivision);
    return Number(division?.entry_fee ?? event.category_fees?.[registrationDivision(row)] ?? event.entry_fee ?? 0);
  };
  const successPayments = payments.filter((payment) => String(payment.status || '').toLowerCase() === 'success');
  const paymentById = new Map(payments.map((payment) => [String(payment.id), payment]));
  const entryRefunds = refunds.filter((refund) => isEntryFeeRefund(refund, paymentById.get(String(refund.payment_id))));
  const refundByReg = new Map();
  refunds.forEach(refund => {
    const id = refund.event_registration_id;
    if (!id) return;
    const current = refundByReg.get(id) || { amount: 0, statuses: [], rows: [] };
    current.amount += Number(refund.amount || 0);
    current.statuses.push(refund.status);
    current.rows.push(refund);
    refundByReg.set(id, current);
  });
  const billableRegistrations = activeRegistrations.filter((row) => !registrationIsCompedEntry(row, successPayments));
  const paidRegistrations = activeRegistrations.filter((row) => registrationCountsAsPaid(row, refundByReg, successPayments));
  const paymentIssues = billableRegistrations.filter((row) => !registrationCountsAsPaid(row, refundByReg, successPayments)
    && String(row.payment_status).toLowerCase() !== 'refunded' && !hasBlockingProcessedRefund(row, refundByReg, payments));
  const paymentFor = (row) => findPaymentForRegistration(successPayments, row);
  const entryAmountFor = (row) => {
    if (!registrationCountsAsPaid(row, null, successPayments)) return 0;
    return getRegistrationEntryFeePaid(paymentFor(row), row, divisionFeeFor(row));
  };
  // Match the existing module: refunded payments remain in gross cash received.
  const dynamicGrossCollected = successPayments.filter(payment => String(payment.payment_type).toLowerCase() === 'event_entry_fee'
    && !isLicensePaymentRow(payment) && !isCompedEntryPayment(payment)).reduce((sum, payment) => sum + Math.max(0, Number(payment.amount || 0)), 0);
  const dynamicBilled = dynamicGrossCollected + paymentIssues.reduce((sum, row) => sum + divisionFeeFor(row), 0);
  const dynamicRefunds = entryRefunds.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const dynamicInterimPaid = (Array.isArray(event.organiser_interim_payments) ? event.organiser_interim_payments : []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const dynamicPaid4M = paidRegistrations.filter((row) => registrationHasPaystackEntryPayment(row, successPayments)).length;
  const dynamicComped = activeRegistrations.filter((row) => registrationIsCompedEntry(row, successPayments)).length;
  const dynamicCommission = dynamicGrossCollected * 0.05;
  const dynamicNet = Math.max(0, dynamicGrossCollected - dynamicRefunds);
  const dynamicFinance = {
    totalEntries: activeRegistrations.length,
    uniquePlayers: new Set(activeRegistrations.map((row) => String(row.email || personName(row)).toLowerCase())).size,
    billed: dynamicBilled,
    grossCollected: dynamicGrossCollected,
    entryRefunds: dynamicRefunds,
    netEntryIncome: dynamicNet,
    outstanding: Math.max(0, dynamicBilled - dynamicGrossCollected),
    paid4M: dynamicPaid4M,
    paidManual: Math.max(0, paidRegistrations.length - dynamicPaid4M - dynamicComped),
    pending: paymentIssues.length,
    comped: dynamicComped,
    commission: dynamicCommission,
    interimPaid: dynamicInterimPaid,
    balanceDue: Math.max(0, dynamicNet - dynamicCommission - dynamicInterimPaid),
  };
  const finance = usePretoriaSnapshot ? PRETORIA_FINANCE_SNAPSHOT : dynamicFinance;
  const billed = finance.billed;
  const collected = finance.grossCollected;
  const outstanding = finance.outstanding;
  const commission = finance.commission;
  const interimPaid = finance.interimPaid;
  const balanceDue = finance.balanceDue;
  const uniqueRegistrations = [...new Map(activeRegistrations.map((row) => [String(row.email || personName(row)).toLowerCase().trim(), row])).values()];
  const licenseCounts = uniqueRegistrations.reduce((counts, row) => {
    const license = resolveRegistrationLicenseCategory(row.email, event.id, row._player, payments);
    counts[license] += 1;
    return counts;
  }, { full: 0, temp: 0, none: 0 });
  if (usePretoriaSnapshot) {
    licenseCounts.full = PRETORIA_FINANCE_SNAPSHOT.fullLicences;
    licenseCounts.temp = PRETORIA_FINANCE_SNAPSHOT.tempLicences;
    licenseCounts.none = PRETORIA_FINANCE_SNAPSHOT.noLicences;
  }
  const hasLicenseBreakdown = usePretoriaSnapshot || (uniqueRegistrations.length > 0 && !financeRestricted);
  const stage = managedEventStage(managedEvent);
  const phase = { label: completion.loading ? 'Loading status…' : completion.error ? 'Status unavailable' : stage, tone: stage === 'Completed' ? 'positive' : stage === 'Upcoming' ? 'info' : 'neutral' };
  const tabs = ['Overview', 'Teams', 'Solo entries', 'Registrations', 'Needs attention', 'Draws', 'Income statement', 'Activity log'];
  const paymentDisplayFor = (row) => {
    if (registrationIsCompedEntry(row, successPayments)) return { label: 'Comped', tone: 'violet', detail: 'Complimentary entry', detailTone: 'violet' };
    if (!registrationCountsAsPaid(row, null, successPayments)) return { label: 'Pending', tone: 'warning', detail: 'Payment outstanding', detailTone: 'amber' };
    const payment = paymentFor(row);
    if (!payment && financeRestricted) return { label: 'Paid', tone: 'positive', detail: 'Payment source unavailable', detailTone: 'neutral' };
    const payer = resolveRegistrationPayer(payment, row);
    const payerRow = payer.payerEmail ? activeRegistrations.find((item) => String(item.email || '').toLowerCase() === payer.payerEmail) : null;
    const method = resolveRegistrationPaymentMethod(row, payment);
    if (payer.isPartnerPaid) return { label: 'Paid', tone: 'positive', detail: `Paid by ${payerRow ? personName(payerRow) : 'partner'}`, detailTone: 'info' };
    if (isExplicitAdminMarkedPayment(payment) || (!isPaystackPaymentMethod(method) && method)) return { label: 'Paid', tone: 'positive', detail: 'Manual / EFT', detailTone: 'amber' };
    return { label: 'Paid', tone: 'positive', detail: 'Via Paystack', detailTone: 'neutral' };
  };
  const teamFor = (row) => {
    const rowEmail = String(row.email || '').toLowerCase();
    const partnerEmail = String(row.partner_email || '').toLowerCase();
    const partnerName = String(row.partner_name || '').toLowerCase().trim();
    const partner = activeRegistrations.find((candidate) => {
      if (String(candidate.id) === String(row.id) || registrationDivision(candidate) !== registrationDivision(row)) return false;
      const candidateEmail = String(candidate.email || '').toLowerCase();
      return (partnerEmail && candidateEmail === partnerEmail)
        || (partnerName && personName(candidate).toLowerCase().trim() === partnerName)
        || (rowEmail && String(candidate.partner_email || '').toLowerCase() === rowEmail);
    });
    const members = partner ? [row, partner] : [row];
    return members.map((member) => {
      const metadata = normalizePaymentMetadata(paymentFor(member)?.metadata);
      return { ...member, _canUnmark: isExplicitAdminMarkedPayment(paymentFor(member)) && !resolveRegistrationPayer(paymentFor(member), member).isPartnerPaid, _paymentDisplay: paymentDisplayFor(member), _paymentNote: metadata.note || metadata.payment_note || null, _entryAmount: financeRestricted ? null : entryAmountFor(member) };
    });
  };
  const teams = [];
  const assignedTeamIds = new Set();
  activeRegistrations.forEach((row) => {
    if (assignedTeamIds.has(String(row.id))) return;
    const team = teamFor(row);
    team.forEach((member) => assignedTeamIds.add(String(member.id)));
    teams.push(team);
  });
  const soloEntries = teams.filter(isSoloTeam).map(team => team[0]);
  const filteredRegistrations = activeRegistrations.filter((row) => {
    const eligibility = registrationEligibility(row).label;
    const haystack = `${personName(row)} ${row.partner_name || ''} ${row.email || ''} ${registrationDivision(row)}`.toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (licenseFilter === 'All licences' || eligibility === licenseFilter)
      && (divisionFilter === 'All divisions' || registrationDivision(row) === divisionFilter);
  });
  const filteredIds = new Set(filteredRegistrations.map((row) => String(row.id)));
  const teamGroups = groupTeamDivisions(teams, divisions, registrationDivision, filteredIds, divisionFilter, Boolean(query.trim()) || licenseFilter !== 'All licences');
  const activityItems = activity;
  const activityPages = Math.max(1, Math.ceil(activityItems.length / 50));
  const currentActivityPage = Math.min(activityPage, activityPages);
  const changeActivityPage = (next) => {
    setActivityPage(Math.max(1, Math.min(next, activityPages)));
    activityHeadingRef.current?.scrollIntoView({ block: 'start' });
    activityHeadingRef.current?.focus({ preventScroll: true });
  };
  const ledgerPayments = incomePayments(payments);
  const abandonedCount = payments.length - ledgerPayments.length;
  const ledgerPages = Math.max(1, Math.ceil((ledgerPayments.length + refunds.length) / 50));
  const drawForDivision = (division) => draws.find((draw) => String(draw.division_id) === String(division.id));
  const exportEvent = (kind) => {
    const rows = kind === 'finance'
      ? [['Metric', 'Amount'], ['Total billed', billed], ['Gross entry fees collected', collected], ['Entry fee refunds', finance.entryRefunds], ['Final entry sales', finance.netEntryIncome], ['Outstanding', outstanding], ['Paystack entries', finance.paid4M], ['Manual / EFT entries', finance.paidManual], ['Comped entries', finance.comped], ['Platform fee', commission], ['Interim paid', interimPaid], ['Balance due', balanceDue]]
      : [['Player', 'Partner', 'Division', 'Payment', 'Licence', 'Status'], ...activeRegistrations.map((row) => [personName(row), row.partner_name || '', registrationDivision(row), normalizePayment(row), registrationEligibility(row).label, row.status || 'registered'])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${eventName(event).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toolbar = <div className="ap-event-toolbar"><label className="ap-filter-search"><Search size={16} /><span className="ap-visually-hidden">Search event players</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search player, partner, email or division" /></label><SearchableDropdown value={licenseFilter} onChange={(e) => setLicenseFilter(e.target.value)} aria-label="Filter by licence"><option>All licences</option><option>Full licence</option><option>Temporary</option><option>No licence</option><option>Not available</option></SearchableDropdown><SearchableDropdown value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} aria-label="Filter by division"><option>All divisions</option>{divisions.map((division) => <option key={division.id}>{division.name || division.division_name}</option>)}</SearchableDropdown></div>;

  const overview = <div className="ap-command-centre-grid ap-live-event-grid">
    <section className="ap-section ap-live-summary"><div className="ap-section-heading"><div><p className="ap-kicker">Event outcome</p><h2>{phase.label} operations</h2></div><Status tone={event.sapa_status ? tierTone(event.sapa_status) : phase.tone}>{event.sapa_status || phase.label}</Status></div><div className="ap-health-grid"><div><strong>{finance.totalEntries}</strong><span>Player entries</span><small>{finance.uniquePlayers} unique players</small></div><div><strong>{formatMoney(finance.netEntryIncome)}</strong><span>Net entry income</span><small>{formatMoney(collected)} gross collected</small></div><div className={outstanding > 0 ? 'is-risk' : ''}><strong>{formatMoney(outstanding)}</strong><span>Outstanding</span><small>{finance.pending} unpaid {finance.pending === 1 ? 'entry' : 'entries'}</small></div></div><div className="ap-license-strip" aria-label="SAPA licence breakdown"><span className="is-full"><b>{hasLicenseBreakdown ? licenseCounts.full : '-'}</b><small>Full licence</small></span><span className="is-temp"><b>{hasLicenseBreakdown ? licenseCounts.temp : '-'}</b><small>Temporary</small></span><span className="is-none"><b>{hasLicenseBreakdown ? licenseCounts.none : '-'}</b><small>No licence</small></span></div><dl className="ap-details-list ap-event-facts"><div><dt>Dates</dt><dd>{formatDate(event.start_date)} - {formatDate(event.end_date || event.start_date)}</dd></div><div><dt>Organisation</dt><dd>{event.organisations?.name || event.organiser_name || 'Not recorded'}</dd></div><div><dt>Host club</dt><dd>{event.clubs?.short_name || event.clubs?.name || event.venue || 'Not recorded'}</dd></div><div><dt>Venue</dt><dd>{event.venue || event.city || 'Not recorded'}</dd></div><div><dt>Registration closed</dt><dd>{formatDate(event.registration_closes_at)}</dd></div><div><dt>RankedIn</dt><dd>{event.rankedin_id ? `Tournament ${event.rankedin_id}` : 'Not linked'}</dd></div></dl></section>
    <section className="ap-section ap-live-divisions"><div className="ap-section-heading"><div><p className="ap-kicker">Competition</p><h2>Divisions</h2></div><button className="ap-text-button" onClick={() => setTab('Draws')}>View draws <ArrowRight size={15} /></button></div><div className="ap-division-list">{divisions.length ? divisions.map((division) => { const name = division.name || division.division_name || 'Unnamed division'; const count = activeRegistrations.filter((row) => registrationDivision(row) === name || String(row.division_id) === String(division.id)).length; return <button className="ap-division-button" key={division.id || name} onClick={() => setAction({ type: 'draw', division, draw: drawForDivision(division) })}><span><b>{name}</b><small>{division.format || division.type || 'Tournament division'}</small></span><strong>{count}<small> entries</small></strong><ChevronRight size={16} /></button>; }) : <div className="ap-empty-inline">No division records were returned.</div>}</div></section>
    <section className="ap-section ap-operational-feed"><div className="ap-section-heading"><div><p className="ap-kicker">Registration ledger</p><h2>Entry health</h2><button className="ap-text-button" onClick={() => setTab('Solo entries')}>{soloEntries.length} solo entries · View players <ArrowRight size={15} /></button></div><button className="ap-text-button" onClick={() => setTab('Registrations')}>Open registrations <ArrowRight size={15} /></button></div><div className="ap-ledger-summary"><span><b>{finance.paid4M + finance.paidManual}</b> paid</span><span><b>{paymentIssues.length}</b> outstanding</span><span><b>{registrations.length - rawActiveRegistrations.length}</b> withdrawn</span></div>{paymentIssues.length > 0 ? <button className="ap-inline-alert" onClick={() => setTab('Needs attention')}><AlertCircle size={19} /><span><b>{paymentIssues.length} registration{paymentIssues.length === 1 ? '' : 's'} need attention</b><small>Inspect payment and eligibility state.</small></span><ArrowRight size={17} /></button> : <div className="ap-clear-state"><CheckCircle2 size={17} /><span><b>No open payment exceptions</b><small>The loaded registration ledger is settled.</small></span></div>}</section>
    <section className="ap-section ap-activity"><div className="ap-section-heading"><div><p className="ap-kicker">Audit trail</p><h2>Latest activity</h2></div><button className="ap-text-button" onClick={() => setTab('Activity log')}>View all</button></div><ol>{activityItems.slice(0, 4).map((item) => <li key={item.id}><span /><div><b>{displayValue(item.summary || item.action, 'Event update')}</b><small>{formatDate(item.created_at)}, {displayValue(item.actor_email || item.actor_role, 'System')}</small></div></li>)}</ol></section>
  </div>;

  const players = <><div className="ap-tab-heading"><div><h2>Teams</h2><button className="ap-text-button" onClick={() => setTab('Solo entries')}>{soloEntries.length} solo entries · View players <ArrowRight size={15} /></button><p>Teams, payments, licence types and management actions in one operational view.</p></div><button className="ap-primary" onClick={() => setAction({ type: 'add' })}><UserPlus size={16} /> Add player / team</button></div>{toolbar}<EventTeamDivisions groups={teamGroups} formatMoney={formatMoney} renderTeam={({ players: team, seed, totalPoints }) => {
    const lead = team[0];
    return <div className="ap-team-row" key={team.map((member) => member.id).join('-')}><button className="ap-team-ident" onClick={() => setAction({ type: 'team', registration: lead, team })}><span>{seed || '—'}</span><i>{totalPoints.toLocaleString('en-ZA')}</i></button><button className="ap-team-names" onClick={() => setAction({ type: 'team', registration: lead, team })}>{team.map((member) => <span className="ap-event-person" key={member.id}><EventPlayerAvatar player={member._player} name={personName(member)} /><span><b>{personName(member)}</b><small>{member.email || 'Contact protected'}</small></span></span>)}</button><span className="ap-stacked-status ap-team-payment-status">{team.map((member) => <span key={member.id}><Status tone={member._paymentDisplay.tone}>{member._paymentDisplay.label}</Status><small className={`ap-payment-source ap-payment-source--${member._paymentDisplay.detailTone || 'neutral'}`}>{member._paymentDisplay.detail}</small>{member._paymentNote && <button className="ap-note-trigger" title="View payment note" aria-label={`Payment note for ${personName(member)}`} onClick={() => setAction({ type: 'note', registration: member, note: member._paymentNote })}><Info size={16} aria-hidden="true" /></button>}{canManagePayments && member._canUnmark && member._paymentDisplay.label === 'Comped' && <button className="ap-comp-remove" onClick={() => setPaymentAction({ type: 'unmark', registration: member })}><RotateCcw size={12} aria-hidden="true" />Remove comp</button>}</span>)}</span><span className="ap-team-amounts">{team.map((member) => <b key={member.id}>{member._entryAmount == null ? 'Not available' : formatMoney(member._entryAmount)}</b>)}</span><span className="ap-stacked-status">{team.map((member) => { const eligibility = registrationEligibility(member); return <Status key={member.id} tone={eligibility.tone}>{eligibility.label}</Status>; })}</span><span className="ap-row-actions">{canManagePayments && <button onClick={() => setMoveAction(team)}><Shuffle size={14} /> Move</button>}{canManagePayments && <button className="is-danger" onClick={() => setRemoveAction(team)}><Trash2 size={14} /> Remove</button>}</span></div>;
  }} /><p className="ap-table-foot">Teams are seeded by combined player points within each division. Click a team to inspect both players.</p></>;

  const registrationList = <><div className="ap-tab-heading"><div><h2>Registrations list</h2><p>Review the player record, partner, licence and payment source together.</p></div><button className="ap-secondary" onClick={() => go('registrations', { event })}>Open full workspace <ExternalLink size={15} /></button></div>{toolbar}<section className="ap-section ap-event-demo-table"><div className="ap-registration-demo-row ap-event-demo-head"><span>Player</span><span>Partner</span><span>Division</span><span>Licence</span><span>Payment</span><span>Submitted</span><span /></div>{filteredRegistrations.slice(0, 50).map((row) => { const payment = paymentDisplayFor(row); return <button className="ap-registration-demo-row" key={row.id} onClick={() => setAction({ type: 'team', registration: row, team: teamFor(row) })}><span className="ap-registration-person"><EventPlayerAvatar player={row._player} name={personName(row)} /><span><b>{personName(row)}</b><small>{row.email || 'Contact protected'}</small></span></span><span className="ap-registration-person"><EventPlayerAvatar player={teamFor(row).find(member => member.id !== row.id)?._player || row._partnerPlayer} name={row.partner_name || 'Partner needed'} /><span><b>{row.partner_name || 'Partner needed'}</b><small>{row.partner_email || ''}</small></span></span><span><b>{registrationDivision(row)}</b></span><Status tone={registrationEligibility(row).tone}>{registrationEligibility(row).label}</Status><span className="ap-payment-cell"><Status tone={payment.tone}>{payment.label}</Status><small className={`ap-payment-source ap-payment-source--${payment.detailTone || 'neutral'}`}>{payment.detail}</small></span><span><b>{formatDate(row.created_at, { year: undefined })}</b><small>Online entry</small></span><ChevronRight size={16} /></button>; })}</section><p className="ap-table-foot">Showing {Math.min(50, filteredRegistrations.length)} of {filteredRegistrations.length} matching registrations.</p></>;

  const drawWorkspace = <><div className="ap-tab-heading"><div><h2>Draws</h2><p>Inspect the format, publish state and player count for every division.</p></div>{event.rankedin_url && <a className="ap-secondary" href={event.rankedin_url} target="_blank" rel="noreferrer">Open RankedIn <ExternalLink size={15} /></a>}</div><div className="ap-draw-layout"><section className="ap-section"><div className="ap-section-heading"><h2>Competition draws</h2><span className="ap-section-count">{draws.length} records</span></div><div className="ap-draw-list">{divisions.map((division) => { const draw = drawForDivision(division); const count = activeRegistrations.filter((row) => String(row.division_id) === String(division.id) || registrationDivision(row) === division.name).length; return <button key={division.id} onClick={() => setAction({ type: 'draw', division, draw })}><span className="ap-row-icon"><Trophy size={16} /></span><span><b>{division.name || division.division_name}</b><small>{draw?.format || division.format || 'Tournament draw'} with {count} entries</small></span><Status tone={draw?.status === 'completed' ? 'positive' : draw ? 'warning' : 'neutral'}>{draw?.status || 'Not generated'}</Status><ChevronRight size={16} /></button>; })}</div></section><aside className="ap-section ap-draw-source"><div className="ap-section-heading"><h2>Draw source</h2></div><dl className="ap-details-list"><div><dt>Provider</dt><dd>{event.rankedin_id ? 'RankedIn' : '4M native draws'}</dd></div><div><dt>Tournament ID</dt><dd>{event.rankedin_id || 'Not linked'}</dd></div><div><dt>Last sync</dt><dd>Available on request</dd></div></dl><button className="ap-primary" onClick={() => setAction({ type: 'sync' })}><RefreshCw size={16} /> Sync to RankedIn</button></aside></div></>;

  const incomeStatement = <>{abandonedCount > 0 && <p className="ap-table-foot">{abandonedCount} abandoned checkout attempts · not charged and excluded from this income statement.</p>}<div className="ap-tab-heading"><div><h2>Income statement</h2><p>Every entry payment, refund, fee and organiser settlement for {eventName(event)}.</p></div><div className="ap-heading-actions"><button className="ap-secondary" onClick={() => setAction({ type: 'export' })}><FileSpreadsheet size={15} /> Export</button><button className="ap-primary" onClick={() => setAction({ type: 'payout', amount: formatMoney(balanceDue) })}>Request payout <ArrowRight size={15} /></button></div></div>
    <section className="ap-section ap-income-summary ap-income-summary--eight"><div><span>Total billed</span><strong>{formatMoney(billed)}</strong><small>{finance.totalEntries} entries</small></div><div className="is-refund"><span>Entry fees refunded</span><strong>-{formatMoney(finance.entryRefunds)}</strong><small>Entry refunds only</small></div><div className={outstanding ? 'is-risk' : ''}><span>Outstanding</span><strong>{formatMoney(outstanding)}</strong><small>{finance.pending} unpaid</small></div><div className="is-accent"><span>Final entry sales</span><strong>{formatMoney(finance.netEntryIncome)}</strong><small>Gross less entry refunds</small></div><div><span>Paystack entries</span><strong>{finance.paid4M}</strong><small>Collected by 4M</small></div><div className="is-manual"><span>Manual / EFT</span><strong>{finance.paidManual}</strong><small>Recorded by organiser</small></div><div><span>Comped entries</span><strong>{finance.comped}</strong><small>Free / complimentary</small></div><div><span>Paid status</span><strong>{finance.paid4M + finance.paidManual}</strong><small>of {finance.totalEntries} paid</small></div></section>
    <section className="ap-section ap-settlement"><div className="ap-section-heading"><div><p className="ap-kicker">Settlement calculation</p><h2>Where the money moved</h2></div><strong>{formatMoney(balanceDue)} due</strong></div><dl className="ap-finance-breakdown"><div><dt>Total amount billed</dt><dd>{formatMoney(billed)}</dd></div><div><dt>Gross entry fees collected</dt><dd className="is-positive">{formatMoney(collected)}</dd></div><div><dt>Entry fee refunds</dt><dd className="is-negative">-{formatMoney(finance.entryRefunds)}</dd></div><div><dt>Final entry sales</dt><dd>{formatMoney(finance.netEntryIncome)}</dd></div><div><dt>Manual / EFT collected by organiser</dt><dd>{finance.paidManual} entries</dd></div><div><dt>Platform fees @ 5% of gross income</dt><dd className="is-negative">-{formatMoney(commission)}</dd></div><div><dt>Interim payments to organiser</dt><dd className="is-processed">-{formatMoney(interimPaid)}</dd></div><div className="is-total"><dt>Balance due from 4M</dt><dd>{formatMoney(balanceDue)}</dd></div></dl><div className="ap-settlement-actions"><small>SAPA licence revenue is retained by 4M and excluded from organiser settlement.</small><button className="ap-primary" onClick={() => setAction({ type: 'payout', amount: formatMoney(balanceDue) })}>Request payout <ArrowRight size={15} /></button></div></section>
    <section className="ap-section ap-live-ledger"><div className="ap-section-heading"><div><p className="ap-kicker">Transactions</p><h2>Payment ledger</h2></div><span className="ap-section-count">{financeRestricted ? 'Financial activity summary' : `${ledgerPayments.length + refunds.length} records`}</span></div>{financeRestricted ? <div className="ap-snapshot-ledger"><div className="ap-snapshot-ledger-row ap-event-demo-head"><span>Activity</span><span>Category</span><span>Amount</span><span>Status</span></div>{[
      ['Paystack entry payments', '93 player entries collected by 4M', 64000, 'payment', 'Reconciled', 'positive'],
      ['Manual / EFT payments', '6 entries recorded by the organiser', 4300, 'amber', 'Reconciled', 'positive'],
      ['Entry fee refunds', 'Refunds deducted from event income', -finance.entryRefunds, 'danger', 'Processed', 'processed'],
      ['Platform fees', '5% of gross entry fees collected', -commission, 'finance', 'Applied', 'processed'],
      ['Interim organiser payouts', 'R15 935 + R40 000 paid', -interimPaid, 'processed', 'Processed', 'processed'],
      ['Balance due from 4M', 'Event settlement is complete', balanceDue, 'payment', 'Settled', 'positive'],
    ].map(([label, detail, amount, typeTone, status, statusTone]) => <div className="ap-snapshot-ledger-row" key={label}><span><b>{label}</b><small>{detail}</small></span><Status tone={typeTone}>{typeTone === 'amber' ? 'Manual' : typeTone === 'danger' ? 'Refund' : typeTone === 'processed' ? 'Payout' : typeTone === 'finance' ? 'Finance' : 'Payment'}</Status><strong className={amount < 0 ? 'is-negative' : amount > 0 ? 'is-positive' : ''}>{amount < 0 ? '-' : ''}{formatMoney(Math.abs(amount))}</strong><Status tone={statusTone}>{status}</Status></div>)}</div> : <div className="ap-payment-ledger"><div className="ap-payment-ledger-row ap-event-demo-head"><span>Date</span><span>Description</span><span>Type</span><span>Player / team</span><span>Amount</span><span>Status</span><span>Method</span></div>{[...refunds.map((refund) => ({ ...refund, _kind: 'refund' })), ...payments.map((payment) => ({ ...payment, _kind: 'payment' }))].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice((ledgerPage - 1) * 50, ledgerPage * 50).map((item) => {
      const matchedRegistrations = ledgerRegistrations(item, registrations, payments);
      const registration = matchedRegistrations[0];
      const playerNames = [...new Set(matchedRegistrations.flatMap(row => [personName(row), row.partner_name]).filter(Boolean))].join(' / ');
      const isRefund = item._kind === 'refund';
      const isLicence = !isRefund && isLicensePaymentRow(item);
      const isSuccess = ['success', 'paid', 'complete', 'completed', 'processed'].includes(String(item.status).toLowerCase());
      return <button className="ap-payment-ledger-row" key={`${item._kind}-${item.id}`} onClick={() => registration && setAction({ type: 'team', registration, team: teamFor(registration) })}><span>{formatDate(item.created_at)}</span><span><b>{item.description || item.reference || (isRefund ? 'Entry fee refund' : isLicence ? 'SAPA licence fee' : 'Entry fee payment')}</b><small>{item.bucket || (isLicence ? '4M retained' : isRefund ? '4M Paystack' : 'Event income')}</small></span><Status tone={isRefund ? 'danger' : isLicence ? 'info' : 'payment'}>{isRefund ? 'Refund' : isLicence ? 'Licence' : 'Payment'}</Status><span className="ap-ledger-person">{registration && <EventPlayerAvatar player={registration._player} name={personName(registration)} />}<span>{playerNames || 'Player not linked'}{registration && <small>{registrationDivision(registration)}</small>}</span></span><strong className={isRefund ? 'is-negative' : 'is-positive'}>{isRefund ? '-' : ''}{formatMoney(item.amount)}</strong><Status tone={isSuccess ? (isRefund ? 'processed' : 'positive') : 'warning'}>{item.status || 'Unknown'}</Status><span>{item.payment_method || item.method || (isRefund ? 'Card reversal' : 'Manual')}</span></button>;
    })}</div>}</section>{!financeRestricted && <nav className="ap-pagination" aria-label="Payment ledger pages"><span>{ledgerPayments.length + refunds.length} transactions</span><div><button className="ap-secondary" disabled={ledgerPage === 1} onClick={() => setLedgerPage(p => p - 1)}>Previous</button><span>Page {ledgerPage} of {ledgerPages}</span><button className="ap-secondary" disabled={ledgerPage === ledgerPages} onClick={() => setLedgerPage(p => p + 1)}>Next</button></div></nav>}</>;

  const history = <><div className="ap-tab-heading"><div><h2 ref={activityHeadingRef} tabIndex={-1}>Activity log</h2><p>Registration, payment, draw and event changes in one chronological record.</p></div><button className="ap-secondary" onClick={() => setAction({ type: 'settings' })}><Filter size={15} /> Log options</button></div>{!activity.length && <div className="ap-data-notice"><LockKeyhole size={16} />No activity records were returned. No representative entries have been added.</div>}<section className="ap-section ap-activity-table"><div className="ap-activity-row ap-event-demo-head"><span>Date</span><span>Change</span><span>Actor</span><span>Area</span><span /></div>{activityItems.slice((currentActivityPage - 1) * 50, currentActivityPage * 50).map((item) => <button className="ap-activity-row" key={item.id} onClick={() => setAction({ type: 'settings' })}><span><b>{formatDate(item.created_at)}</b></span><span><b>{displayValue(item.summary || item.action, 'Event update')}</b><small>{displayValue(item.details, 'Event history record')}</small></span><span>{displayValue(item.actor_email || item.actor_role, 'System')}</span><Status tone={activityTone(item.category)}>{displayValue(item.category, 'System')}</Status><ChevronRight size={16} /></button>)}</section>{activityItems.length > 0 && <nav className="ap-pagination" aria-label="Activity log pages"><span role="status">Showing {(currentActivityPage - 1) * 50 + 1}–{Math.min(currentActivityPage * 50, activityItems.length)} of {activityItems.length} entries</span><div><button className="ap-secondary" disabled={currentActivityPage === 1} onClick={() => changeActivityPage(currentActivityPage - 1)}>Previous</button><span>Page {currentActivityPage} of {activityPages}</span><button className="ap-secondary" disabled={currentActivityPage === activityPages} onClick={() => changeActivityPage(currentActivityPage + 1)}>Next</button></div></nav>}</>;
  const attentionList = <EventAttentionList rows={paymentIssues.map(row => ({ id: row.id, name: personName(row), partner: row.partner_name, division: registrationDivision(row), issue: paymentDisplayFor(row).detail || 'Payment needs review', eligibility: registrationEligibility(row).label }))} onBack={() => setTab('Overview')} onOpen={id => { const registration = paymentIssues.find(row => row.id === id); if (registration) setAction({ type: 'team', registration, team: teamFor(registration) }); }}/>;
  const soloList = <EventAttentionList solo rows={soloEntries.map(row => ({ id: row.id, name: personName(row), division: registrationDivision(row), issue: 'Solo · No partner recorded', eligibility: registrationEligibility(row).label }))} onBack={() => setTab('Overview')} onOpen={id => { const registration = soloEntries.find(row => row.id === id); if (registration) setAction({ type: 'team', registration, team: teamFor(registration) }); }}/>;
  const sections = { 'Solo entries': soloList, Overview: overview, Teams: players, Registrations: registrationList, 'Needs attention': attentionList, Draws: drawWorkspace, 'Income statement': incomeStatement, 'Activity log': history };

  return <><section className="ap-event-demo-header"><div className="ap-event-demo-top"><button className="ap-back-button" onClick={() => go('events')}><ArrowLeft size={16} /> Events</button><div className="ap-event-title"><span>Operate / Events</span><h1>{eventName(event)}</h1><p><CalendarDays size={14} /> {formatDate(event.start_date)} - {formatDate(event.end_date || event.start_date)}<i /><MapPin size={14} /> {event.venue || event.city || 'Venue to confirm'}</p></div><div className="ap-event-demo-actions">{operationAccess && !completion.loading && !completion.error && <EventCompletionControl client={client} session={session} scopeId={scopeId} event={managedEvent} onSaved={receipt => setCompletion({ loading: false, value: receipt.completed_at })} onClose={result => { if (result?.refresh) onRefresh?.(); }} />}<button className="ap-primary" onClick={() => setAction({ type: 'add' })}><UserPlus size={16} /> Add player / team</button><button className="ap-secondary" disabled={!canManagePayments} onClick={() => setAction({ type: 'sync' })}><RefreshCw size={16} /> Sync</button><button className="ap-secondary" onClick={() => setAction({ type: 'export' })}><Download size={16} /> Export</button><button className="ap-icon-button" onClick={() => setAction({ type: 'settings' })} aria-label="Event options"><MoreHorizontal size={18} /></button></div></div><div className="ap-event-demo-meta"><Status tone={phase.tone}>{phase.label}</Status><span><b>{finance.totalEntries}</b> entries</span><span><b>{finance.paid4M + finance.paidManual}</b> paid</span><span><b>{formatMoney(finance.netEntryIncome)}</b> net entry income</span><span><b>{formatMoney(outstanding)}</b> outstanding</span></div><div className="ap-record-tabs" role="tablist" aria-label="Event record sections">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}{item === 'Teams' && <span>{teams.length}</span>}{item === 'Solo entries' && <span>{soloEntries.length}</span>}{item === 'Needs attention' && <span>{paymentIssues.length}</span>}</button>)}</div></section><AnimatePresence mode="wait" initial={false}><Motion.div key={tab} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .14 }}>{sections[tab]}</Motion.div></AnimatePresence><AnimatePresence>{action && action.type !== 'sync' && <EventDemoModal action={action} event={event} divisions={divisions} onClose={result => { setAction(null); if (result?.refresh) onRefresh?.(); }} onMove={canManagePayments ? team => { setAction(null); setMoveAction(team); } : undefined} onRemove={canManagePayments ? team => { setAction(null); setRemoveAction(team); } : undefined} onMerge={operationAccess && action?.registration && eligibleRegistrationTeamPartners(action.registration, activeRegistrations, divisions).length ? row => { setAction(null); setTeamOperation({ action: 'merge', registration: row }); } : undefined} onSplit={operationAccess && action?.registration && findRegistrationTeammate(action.registration, activeRegistrations, divisions) ? row => { setAction(null); setTeamOperation({ action: 'split', registration: row }); } : undefined} onPair={canManagePayments && action?.registration && isAvailableSolo(action.registration, activeRegistrations) ? row => { setAction(null); setPairTarget(row); } : undefined} onEditDetails={canManagePayments ? () => { setAction(null); setDetailsOpen(true); } : undefined} onCancelScope={canManagePayments ? scope => { setAction(null); setCancelScope(scope); } : undefined} onSaveEntry={canManagePayments ? draft => saveEventEntry(event, draft) : undefined} onExport={exportEvent} onPaymentAction={canManagePayments ? (member, type) => { setAction(null); setPaymentAction({ registration: member, type }); } : null} />}</AnimatePresence>{canManagePayments && paymentAction && <EventPaymentDialog key={String(paymentAction.registration.id) + paymentAction.type} action={paymentAction} event={event} divisions={divisions} onClose={result => { setPaymentAction(null); if (result?.refresh) onRefresh?.(); }}/>}{canManagePayments && moveAction && <EventMoveDialog event={event} team={moveAction} divisions={divisions} onClose={result => { setMoveAction(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && removeAction && <EventRemovalDialog event={event} team={removeAction} onClose={result => { setRemoveAction(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && action?.type === "sync" && <EventRankedinDialog event={event} onClose={result => { setAction(null); if (result?.refresh) onRefresh?.(); }} />}{operationAccess && teamOperation && <EventTeamManagementDialog client={client} session={session} scopeId={scopeId} event={event} registration={teamOperation.registration} action={teamOperation.action} registrations={activeRegistrations} divisions={divisions} onClose={result => { setTeamOperation(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && pairTarget && <EventPairDialog directoryOnly event={event} solo={pairTarget} registrations={activeRegistrations} onClose={result => { setPairTarget(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && cancelScope && <EventCancellationDialog event={event} divisions={divisions} scope={cancelScope} onClose={result => { setCancelScope(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && detailsOpen && <EventDetailsDialog client={client} session={session} scopeId={scopeId} event={event} onClose={result => { setDetailsOpen(false); if (result?.refresh) onRefresh?.(); }} />}</>;
}

function WorkspacePlaceholder({ icon: Icon, title, detail }) { return <section className="ap-section ap-workspace-placeholder">{React.createElement(Icon, { size: 30 })}<h2>{title}</h2><p>{detail}</p><button className="ap-secondary" title="Actions are disabled in this read-only preview">Open workspace</button></section>; }

function RegistrationDrawer({ registration, onClose, go, event }) {
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); const key = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);
  if (!registration) return null;
  const payment = normalizePayment(registration);
  const eligibility = registrationEligibility(registration);
  const eligibilityIcon = eligibility.tone === 'positive' ? <CheckCircle2 size={17} /> : eligibility.tone === 'danger' ? <AlertCircle size={17} /> : <Clock3 size={17} />;
  return <Motion.aside className="ap-drawer" role="dialog" aria-modal="true" aria-labelledby="registration-drawer-title" initial={{ x: 36, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={{ type: 'spring', duration: .28, bounce: 0 }}>
    <div className="ap-drawer-head"><div><p className="ap-kicker">Registration {registration.id}</p><h2 id="registration-drawer-title">{personName(registration)}</h2></div><button ref={closeRef} className="ap-icon-button" onClick={onClose} aria-label="Close registration details"><X size={19} /></button></div>
    <div className="ap-drawer-body"><div className="ap-drawer-status"><Status tone={payment === 'paid' ? 'positive' : payment === 'failed' ? 'danger' : 'warning'}>{payment === 'paid' ? 'Paid' : payment === 'failed' ? 'Payment failed' : 'Payment pending'}</Status><Status tone={String(registration.status).includes('review') ? 'warning' : 'neutral'}>{String(registration.status || 'Submitted').replaceAll('_', ' ')}</Status></div><dl className="ap-details-list"><div><dt>Event</dt><dd>{event?.event_name || event?.title || 'Cape Town Open'}</dd></div><div><dt>Division</dt><dd>{registrationDivision(registration)}</dd></div><div><dt>Partner</dt><dd>{registration.partner_name || 'Partner needed'}</dd></div><div><dt>Submitted</dt><dd>{formatDate(registration.created_at)}</dd></div><div><dt>Amount</dt><dd>{(registration.amount ?? event?.entry_fee) != null ? formatMoney(registration.amount ?? event?.entry_fee) : 'Not exposed'}</dd></div></dl><section><p className="ap-kicker">Checks</p><div className="ap-check-list"><span className={!registration._player ? 'is-risk' : ''}>{registration._player ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />} Player record {registration._player ? 'matched' : 'not matched'}</span><span className={eligibility.tone === 'danger' ? 'is-risk' : ''}>{eligibilityIcon} {eligibility.label}</span><span className={payment !== 'paid' ? 'is-risk' : ''}>{payment === 'paid' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />} Payment {payment}</span></div></section><section><p className="ap-kicker">Record trail</p><button className="ap-linked-record" onClick={() => go('player', { registration, event })}><span className="ap-avatar">{personName(registration).slice(0, 1)}</span><span><b>{personName(registration)}</b><small>Open player record</small></span><ChevronRight size={17} /></button></section></div><div className="ap-drawer-actions">{payment === 'failed' && <button className="ap-primary" onClick={() => go('payment', { registration, event })}>Resolve payment <ArrowRight size={16} /></button>}<button className="ap-secondary" title="Actions are disabled in this read-only preview">Approve registration</button></div>
  </Motion.aside>;
}

function RegistrationsWorkspace({ event, events, registrations, go, initialRegistration }) {
  const activeEvent = event || events[0] || PREVIEW_EVENT; const [query, setQuery] = useState(''); const [status, setStatus] = useState('All states'); const [selected, setSelected] = useState([]); const [drawer, setDrawer] = useState(initialRegistration || null); const [page, setPage] = useState(1);
  const eventRegs = registrations.filter((row) => !activeEvent || String(row.event_id) === String(activeEvent.id));
  const visible = eventRegs.filter((row) => `${personName(row)} ${row.partner_name || ''} ${registrationDivision(row)} ${row.id}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All states' || (status === 'Payment issues' && normalizePayment(row) === 'failed') || (status === 'Needs review' && String(row.status).includes('review')) || (status === 'Paid' && normalizePayment(row) === 'paid')));
  const pageCount = Math.max(1, Math.ceil(visible.length / REGISTRATION_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * REGISTRATION_PAGE_SIZE, currentPage * REGISTRATION_PAGE_SIZE);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <><PageHeading eyebrow={`${activeEvent.event_name || activeEvent.title} / Operate`} title="Registrations" description="Review entries, payment state, eligibility and partner completion without leaving the event."><button className="ap-secondary" title="Actions are disabled in this read-only preview"><Download size={16} /> Export view</button><button className="ap-primary" title="Actions are disabled in this read-only preview"><Plus size={16} /> Add registration</button></PageHeading>
    <div className="ap-filter-bar"><label className="ap-filter-search"><Search size={17} /><span className="ap-visually-hidden">Search registrations</span><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search player, team or registration" /></label><div className="ap-filter-tabs" role="group" aria-label="Registration state filter">{['All states', 'Needs review', 'Payment issues', 'Paid'].map((item) => <button key={item} aria-pressed={status === item} onClick={() => { setStatus(item); setPage(1); }}>{item}</button>)}</div></div>
    <AnimatePresence initial={false}>{selected.length > 0 && <Motion.div className="ap-bulk-bar" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}><strong>{selected.length} selected</strong><button title="Actions are disabled in this read-only preview">Approve selected</button><button title="Actions are disabled in this read-only preview">Send message</button><button onClick={() => setSelected([])}>Clear selection</button></Motion.div>}</AnimatePresence>
    <section className="ap-section ap-registration-table"><div className="ap-registration-row ap-registration-head"><span><input type="checkbox" aria-label="Select all registrations on this page" checked={pageRows.length > 0 && pageRows.every((row) => selected.includes(row.id))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...pageRows.map((row) => row.id)])] : selected.filter((id) => !pageRows.some((row) => row.id === id)))} /></span><span>Player / team</span><span>Division</span><span>Submitted</span><span>Payment</span><span>Eligibility</span><span>Status</span><span /></div><AnimatePresence mode="popLayout" initial={false}>{pageRows.map((row) => { const payment = normalizePayment(row); const eligibility = registrationEligibility(row); return <Motion.div layout key={row.id} className={`ap-registration-row ${selected.includes(row.id) ? 'is-selected' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span><input type="checkbox" aria-label={`Select ${personName(row)}`} checked={selected.includes(row.id)} onChange={() => toggle(row.id)} /></span><button className="ap-person-cell" onClick={() => setDrawer(row)}><i>{personName(row).slice(0, 1)}</i><span><b>{personName(row)}</b><small>{row.partner_name ? `with ${row.partner_name}` : 'Partner needed'}</small></span></button><span><b>{registrationDivision(row)}</b><small>{row.id}</small></span><span><b>{formatDate(row.created_at, { year: undefined })}</b><small>Online entry</small></span><span><Status tone={payment === 'paid' ? 'positive' : payment === 'failed' ? 'danger' : 'warning'}>{payment}</Status></span><span><Status tone={eligibility.tone}>{eligibility.label}</Status></span><span><Status tone={String(row.status).includes('review') ? 'warning' : row.status === 'approved' ? 'positive' : 'neutral'}>{String(row.status || 'submitted').replaceAll('_', ' ')}</Status></span><button className="ap-icon-button" onClick={() => setDrawer(row)} aria-label={`Open ${personName(row)} registration`}><ChevronRight size={17} /></button></Motion.div>; })}</AnimatePresence>{!visible.length && <div className="ap-empty"><Search size={28} /><h3>No registrations match this view</h3><p>Clear the search or choose another state.</p><button className="ap-secondary" onClick={() => { setQuery(''); setStatus('All states'); setPage(1); }}>Clear filters</button></div>}</section>
    {visible.length > 0 && <nav className="ap-pagination" aria-label="Registration pages"><span>Showing {(currentPage - 1) * REGISTRATION_PAGE_SIZE + 1}-{Math.min(currentPage * REGISTRATION_PAGE_SIZE, visible.length)} of {visible.length}</span><div><button className="ap-secondary" disabled={currentPage === 1} onClick={() => { setPage((current) => Math.max(1, current - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className="ap-secondary" disabled={currentPage === pageCount} onClick={() => { setPage((current) => Math.min(pageCount, current + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Next</button></div></nav>}
    <AnimatePresence>{drawer && <><Motion.button className="ap-drawer-scrim" aria-label="Close registration details" onClick={() => setDrawer(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><RegistrationDrawer registration={drawer} onClose={() => setDrawer(null)} go={go} event={activeEvent} /></>}</AnimatePresence></>;
}

function PaymentException({ registration, event, go }) {
  const row = registration || PREVIEW_REGISTRATIONS[0]; const activeEvent = event || PREVIEW_EVENT; const [sent, setSent] = useState(false);
  return <><button className="ap-back-button" onClick={() => go('registrations', { event: activeEvent, registration: row })}><ArrowLeft size={17} /> Registration {row.id}</button><PageHeading eyebrow={`${activeEvent.event_name || activeEvent.title} / ${row.id}`} title="Payment exception" description={`${personName(row)}${row.partner_name ? ` and ${row.partner_name}` : ''}, ${registrationDivision(row)}`}><button className="ap-secondary" onClick={() => go('registrations', { event: activeEvent, registration: row })}>View registration</button><button className="ap-primary" onClick={() => setSent(true)}>{sent ? <Check size={17} /> : <Mail size={17} />}{sent ? 'Payment link ready' : 'Prepare payment link'}</button></PageHeading>
    <div className="ap-payment-alert"><span><AlertCircle size={21} /></span><div><strong>Payment declined</strong><p>The issuing bank declined the card. No funds were collected and this registration remains reserved for 22 hours.</p></div><Status tone="danger">Action required</Status></div>
    <div className="ap-payment-grid"><section className="ap-section ap-payment-story"><div className="ap-section-heading"><div><p className="ap-kicker">Recovery path</p><h2>Keep the place, recover the payment</h2></div><CreditCard size={23} /></div><ol className="ap-recovery-steps"><li className="is-done"><span><Check size={15} /></span><div><b>Registration reserved</b><small>The entry remains in the event while payment is unresolved.</small></div></li><li className="is-active"><span>2</span><div><b>Send a secure payment link</b><small>Let the player retry with a different card or payment method.</small>{sent && <div className="ap-link-ready" role="status"><CheckCircle2 size={16} /> Link prepared locally. No message was sent.</div>}</div></li><li><span>3</span><div><b>Confirm automatically</b><small>A successful payment clears the exception and confirms the entry.</small></div></li></ol><div className="ap-action-callout"><div><MessageSquare size={19} /><span><b>Suggested message</b><small>Hi {personName(row).split(' ')[0]}, your place in the {activeEvent.event_name || activeEvent.title} is reserved. Use the secure link to retry payment.</small></span></div><button className="ap-primary" onClick={() => setSent(true)}>{sent ? 'Link prepared' : 'Prepare link'}</button></div></section><aside className="ap-section ap-payment-summary"><p className="ap-kicker">Payment record</p><h2>{formatMoney(row.amount || activeEvent.entry_fee)}</h2><Status tone="danger">Declined</Status><dl className="ap-details-list"><div><dt>Reference</dt><dd>{row.payment_reference || row.reference || row.id}</dd></div><div><dt>Method</dt><dd>{row.payment_method || 'Online payment'}</dd></div><div><dt>Attempted</dt><dd>{formatDate(row.updated_at || row.created_at)}</dd></div><div><dt>Gateway response</dt><dd>{row.payment_failure_reason || 'Payment not completed'}</dd></div><div><dt>Funds collected</dt><dd>{formatMoney(0)}</dd></div></dl><button className="ap-text-button" title="Actions are disabled in this read-only preview">Open payment record <ExternalLink size={14} /></button></aside></div>
  </>;
}

function PlayerRecord({ registration, event, go }) {
  const row = registration || PREVIEW_REGISTRATIONS[0]; const [tab, setTab] = useState('Overview');
  return <>
    <button className="ap-back-button" onClick={() => go('registrations', { event, registration: row })}><ArrowLeft size={17} /> Registration {row.id}</button>
    <div className="ap-player-hero">
      <div className="ap-player-monogram">{personName(row).split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
      <div><p className="ap-eyebrow">Player record</p><h1>{personName(row)}</h1><p>{row.email || 'Email unavailable'}</p></div>
      <div className="ap-player-actions"><Status tone={row._player ? 'positive' : 'neutral'}>{row._player ? 'Matched player' : 'Public entry'}</Status><button className="ap-secondary" title="Actions are disabled in this read-only preview"><Mail size={16} /> Send message</button></div>
    </div>
    <div className="ap-record-tabs" role="tablist">{['Overview', 'Registrations', 'Payments', 'Results', 'Activity'].map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    <AnimatePresence mode="wait" initial={false}><Motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="ap-player-grid">
      <section className="ap-section"><div className="ap-section-heading"><div><p className="ap-kicker">Identity</p><h2>Player details</h2></div><ShieldCheck size={21} /></div><dl className="ap-details-list"><div><dt>Player ID</dt><dd>{row._player?.id || row.player_id || 'Not exposed in public view'}</dd></div><div><dt>Email</dt><dd>{row.email || 'Unavailable'}</dd></div><div><dt>Partner</dt><dd>{row.partner_name || 'Not assigned'}</dd></div><div><dt>Division</dt><dd>{registrationDivision(row)}</dd></div><div><dt>Registration</dt><dd>{row.id}</dd></div></dl></section>
      <section className="ap-section ap-linked-section"><div className="ap-section-heading"><div><p className="ap-kicker">Connected record</p><h2>Current registration</h2></div><Status tone={normalizePayment(row) === 'failed' ? 'danger' : 'positive'}>{normalizePayment(row)}</Status></div><button className="ap-linked-card" onClick={() => go('registrations', { event, registration: row })}><span><b>{event?.event_name || event?.title || PREVIEW_EVENT.event_name}</b><small>{registrationDivision(row)}, {row.id}</small></span><ChevronRight size={18} /></button><div className="ap-relationship-line"><span>Player</span><i /><span>Registration</span><i /><span>Event</span></div></section>
    </Motion.div></AnimatePresence>
  </>;
}

function WorkspaceLanding({ workspace, setWorkspace, page, go }) {
  const current = WORKSPACES.find((item) => item.id === workspace);
  const connected = { players: 'Directory and profile editing', clubs: 'Directory and contact/details editing', coaches: 'Application directory · read-only', payments: 'Recorded payments and refunds · read-only', payouts: 'Recorded organiser payments · read-only', reports: 'Finance reports · read-only', 'team-access': 'Access workspace', gallery: 'Albums and photos · local drafts; staging writes gated', email: 'Audience and message review · sending not connected' };
  const selected = current.items.find(item => item.page === page);
  return <><PageHeading eyebrow={`${current.label} / Integration status`} title={selected?.label || current.label} description="This module is not connected in the new UI yet." /><div className="ap-workspace-landing"><section><h2>{current.label} tools</h2><p>Available modules are listed below. Unconnected modules remain disabled here; their existing admin workflows have not been replaced.</p><div className="ap-destination-list">{current.items.map(item => <button key={item.label} disabled={!connected[item.page]} onClick={() => go(item.page)}><b>{item.label}</b><span>{connected[item.page] || 'Not integrated yet'}</span>{connected[item.page] && <ArrowRight size={17}/>}</button>)}</div><button className="ap-primary" onClick={() => setWorkspace('operate')}>Open Operate <ArrowRight size={16}/></button></section></div></>;
}

export default function AdminPreview() {
  const location = useLocation(); const navigate = useNavigate(); const reduceMotion = useReducedMotion();
  const page = location.pathname.split('/').filter(Boolean)[1] || 'home';
  const [playerRefresh, setPlayerRefresh] = useState(0);
  const [session, setSession] = useState(null); const [authLoading, setAuthLoading] = useState(true); const [sidebarOpen, setSidebarOpen] = useState(false); const [commandOpen, setCommandOpen] = useState(false);
  const [context, setContext] = useState({ event: null, registration: null });
  const queryParams = new URLSearchParams(location.search);
  const localFixture = import.meta.env.DEV && queryParams.get('preview-fixture') === '1';
  const focusEventId = localFixture ? null : queryParams.get('event');
  const localLivePreview = false;
  const previewBypass = localFixture;
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); }).catch(() => setAuthLoading(false)); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthLoading(false); }); return () => subscription.unsubscribe(); }, []);
  const effectiveSession = useMemo(() => session || (previewBypass ? { user: { email: 'preview@4mpadel.local' } } : null), [session, previewBypass]);
  const { permissions, loading: permissionsLoading } = useAdminPermissions(['players', 'calendar'].includes(page) ? session?.user?.email : previewBypass ? null : effectiveSession?.user?.email);
  const fixturePermissions = useMemo(() => previewBypass ? { role: 'super_admin', orgs: [], clubs: [] } : permissions, [previewBypass, permissions]);
  const [scopeSelection, setScopeSelection] = useState(null);
  const scopes = useMemo(() => previewScopes(fixturePermissions), [fixturePermissions]);
  const scope = scopes.find(item => scopeSelection?.identity === session?.user?.id && item.id === scopeSelection?.id) || scopes[0];
  const setScope = item => {
    setContext({ event: null, registration: null });
    setCommandOpen(false);
    setScopeSelection({ id: item.id, identity: session?.user?.id });
    navigate('/admin-preview/events');
  };
  const data = usePreviewData(!['home', 'events', 'event', 'registrations', 'payment', 'player'].includes(page) || permissionsLoading ? null : effectiveSession, fixturePermissions, localFixture, focusEventId, false, scope);
  const activeWorkspace = WORKSPACES.find(workspace => workspace.items.some(item => (item.activePages || [item.page]).includes(page)))?.id || 'operate';
  const setActiveWorkspace = (id) => { const first = WORKSPACES.find(workspace => workspace.id === id)?.items[0]; if (first) go(first.page); };
  const go = useCallback((target, payload = {}) => {
    setContext((current) => ({ event: payload.event || current.event, registration: payload.registration || (target === 'events' ? null : current.registration) }));
    const nextQuery = new URLSearchParams(location.search);
    const keepPublicPreview = import.meta.env.DEV && (nextQuery.has('event') || nextQuery.get('preview-live') === '1');
    if (['events', 'home', ...RECORD_WORKSPACE_PAGES].includes(target)) {
      nextQuery.delete('event');
      if (keepPublicPreview) nextQuery.set('preview-live', '1');
    }
    for (const key of ['view', 'q', 'licence', 'visibility', 'region', 'category', 'sort', 'p', 'player', 'detail']) nextQuery.delete(key);
    for (const key of ['workspace', 'division', 'license_player']) nextQuery.delete(key);
    for (const key of [...nextQuery.keys()]) if (key.startsWith('cal_') || ['calView', 'calPage', 'calendarEvent', 'month', 'day'].includes(key)) nextQuery.delete(key);
    if (target === 'player') {
      const registration = payload.registration;
      nextQuery.delete('event');
      if (keepPublicPreview) nextQuery.set('preview-live', '1');
      nextQuery.set('view', 'directory');
      if (registration?._player?.id || registration?.player_id) nextQuery.set('player', registration._player?.id || registration.player_id);
      else if (registration) nextQuery.set('q', registration.email || personName(registration));
    }
    if (['event', 'tournaments'].includes(target) && payload.event?.id) nextQuery.set('event', payload.event.id);
    const search = nextQuery.toString();
    navigate(`/admin-preview/${target === 'player' ? 'players' : target}${search ? `?${search}` : ''}`);
  }, [navigate, location.search, setContext]);
  useEffect(() => { const key = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); } }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, []);
  useEffect(() => { if (activeWorkspace !== 'operate') return; if (!['home', 'events', 'event', 'registrations', 'payment', 'player', 'calendar', 'tournaments'].includes(page)) navigate(`/admin-preview/home${location.search}`, { replace: true }); }, [activeWorkspace, page, navigate, location.search]);

  if ((!previewBypass && authLoading) || (effectiveSession && permissionsLoading && !previewBypass)) return <main className="ap-loading"><LoaderCircle className="ap-spin" /><p>Preparing your operations brief…</p></main>;
  if (!effectiveSession) return <LoginGate onSession={setSession} />;
  const canAccess = fixturePermissions?.role === 'super_admin' || fixturePermissions?.allowed_tabs?.length || fixturePermissions?.orgs?.length || fixturePermissions?.clubs?.length || fixturePermissions?.federations?.length
    || fixturePermissions?.module_permissions?.gallery?.allowedAlbums?.length || fixturePermissions?.module_permissions?.['event-mgmt']?.allowedEvents?.length || fixturePermissions?.tournamentAssignments?.length;
  if (!canAccess) return <main className="ap-denied"><ShieldCheck size={36} /><h1>Admin access is required</h1><p>This preview uses the same permissions as the current admin.</p><a className="ap-primary" href="/admin">Return to current admin</a></main>;
  const activeEvent = data.events.find(item => String(item.id) === String(focusEventId || context.event?.id || context.registration?.event_id)) || data.events[0];
  const activeRegistration = data.registrations.find(item => item.id === context.registration?.id) || data.registrations.find((item) => normalizePayment(item) === 'failed') || data.registrations[0];
  const userName = effectiveSession.user.email?.split('@')[0]?.split(/[._-]/)[0]?.replace(/^./, (letter) => letter.toUpperCase()) || 'there';
  let content;
  if (scope.id !== 'all' && ['players', 'calendar'].includes(page)) content = <section className="ap-section"><ShieldCheck size={28} /><h2>This workspace is not yet available in {scope.label}</h2><p>Organisation and club access for this module is still being connected.</p><button className="ap-secondary" onClick={() => setScope(scopes[0])}>Return to my authorised access</button></section>;
  else if (!localFixture && ['home', 'events', 'event', 'registrations', 'payment', 'player'].includes(page) && !canReadPreviewEvents(permissions)) content = <section className="ap-section"><ShieldCheck size={28} /><h2>Event Manager access is required</h2><p>Your account has no Event Manager permission. Choose one of your authorised modules.</p></section>;
  else if (['event', 'registrations', 'payment', 'player'].includes(page) && (data.loading || !activeEvent)) content = <EventRecordState loading={data.loading} error={data.error}/>;
  else if (page === 'players' && session && (permissionsLoading || !permissions)) content = <section className="ap-section ap-live-loading" role="status">Checking Players access…</section>;
  else if (page === 'players' && session && permissions?.role !== 'super_admin' && !permissions?.allowed_tabs?.includes('players')) content = <section className="ap-section ap-live-loading"><ShieldCheck size={28} /><h2>Players access is required</h2><p>This account does not have access to the existing Players admin module.</p></section>;
  else if (page === 'players') content = <PlayersWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${playerRefresh}`} session={session} scopeId={scope.id} />;
  else if (page === 'team-access') content = scope.id !== 'all' ? <section className="ap-section ax-block"><ShieldCheck size={28} /><h2>Account access management</h2><p>Return to your account workspace to review permissions. Delegated organisation and club access management is still being connected.</p><button className="ap-secondary" onClick={() => { setScopeSelection(null); setContext({ event: null, registration: null }); }}>Return to account workspace</button></section> : <AccessWorkspace key={`${session?.user?.id || 'signed-out'}-${playerRefresh}`} session={session} permissions={permissions} />;
  else if (page === 'reports') content = <FinanceOverview key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'payments') content = <PaymentsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'payouts') content = <PayoutsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'clubs') content = <ClubsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'organisations') content = <OrganisationsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'federations') content = <FederationsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'coaches') content = <CoachesWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}-${playerRefresh}`} session={session} permissions={permissions} scopeId={scope.id} />;
  else if (page === 'gallery') content = <GalleryWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'email') content = <EmailBroadcastWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'licenses') content = <LicensesWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} initialPlayerId={queryParams.get('license_player')} />;
  else if (page === 'tournaments' && (!session || scope.id !== 'all' || !(permissions?.role === 'super_admin' || permissions?.tournamentAssignments?.length))) content = <section className="ap-section"><ShieldCheck size={28}/><h2>Tournament Manager access is required</h2><p>Use your account workspace with an assigned tournament capability. Sidebar permissions alone do not grant tournament access.</p></section>;
  else if (page === 'tournaments') content = <TournamentAdminWorkspace key={`${session.user.id}-${scope.id}`} client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh} canBuildEvents={!localFixture && permissions?.role === 'super_admin'} />;
  else if (activeWorkspace !== 'operate') content = <WorkspaceLanding workspace={activeWorkspace} setWorkspace={setActiveWorkspace} page={page} go={go} />;
  else if (page === 'events' && data.loading) content = <section className="ap-section"><RecordLoading label="Loading Event Manager records…" detail="Reading events and registrations available in your current workspace. Larger histories may take longer."/></section>;
  else if (page === 'events' && data.error) content = <section className="ap-section ap-live-loading"><h2>Event Manager could not be loaded</h2><p>{data.error}</p><button className="ap-secondary" onClick={data.reload}>Try again</button></section>;
  else if (page === 'events') content = <EventManagerDashboard key={session?.user?.id || 'signed-out'} events={data.events} registrations={data.registrations} go={go} session={session} scopeId={scope.id} canReadSnapshots={Boolean(session) && !localFixture} />;
  else if (page === 'event' && focusEventId && data.loading) content = <section className="ap-section ap-live-loading"><LoaderCircle className="ap-spin" /><h2>Loading the live event</h2><p>Reading the event, registrations, payments, divisions and activity available to your admin account.</p></section>;
  else if (page === 'event' && focusEventId && data.error) content = <section className="ap-section ap-live-loading"><AlertCircle size={24} /><h2>The live event could not be loaded</h2><p>{data.error}</p><button className="ap-secondary" onClick={data.reload}>Try again</button></section>;
  else if (page === 'event' && focusEventId && !activeEvent.is_manual) content = <EventParticipantsWorkspace key={`${activeEvent.id}-${session?.user?.id}-${scope.id}`} event={activeEvent} go={go} session={session} scopeId={scope.id} onRefresh={data.reload} />;
  else if (page === 'event' && focusEventId) content = <LiveEventCommandCentre session={session} scopeId={scope.id} event={activeEvent} registrations={data.registrations} payments={data.payments} divisions={data.divisions} activity={data.activity} draws={data.draws} refunds={data.refunds} go={go} financeRestricted={localLivePreview && !session} canManagePayments={Boolean(session) && !localFixture && permissions?.role === 'super_admin' && scope.id === 'all'} onRefresh={data.reload} />;
  else if (page === 'event') content = <EventCommandCentre event={activeEvent} registrations={data.registrations} go={go} />;
  else if (page === 'calendar' && session && (permissionsLoading || !permissions)) content = <section className="ap-section" role="status">Checking Calendar access…</section>;
  else if (page === 'calendar' && session && permissions?.role !== 'super_admin' && !permissions?.allowed_tabs?.includes('calendar')) content = <section className="ap-section"><h2>Calendar access is required</h2><p>Your account does not have Calendar admin permission.</p></section>;
  else if (page === 'calendar') content = <CalendarWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${playerRefresh}`} session={session} scopeId={scope.id} canManageEvents={Boolean(session) && !localFixture && permissions?.role === 'super_admin' && scope.id === 'all'} />;
  else if (page === 'registrations') content = <RegistrationsWorkspace key={`${session?.user?.id}-${scope.id}`} event={activeEvent} events={data.events} registrations={data.registrations} go={go} initialRegistration={data.registrations.find(item => item.id === context.registration?.id)} />;
  else if (page === 'payment') content = <PaymentException registration={activeRegistration} event={activeEvent} go={go} />;
  else if (page === 'player') content = <PlayerRecord registration={activeRegistration} event={activeEvent} go={go} />;
  else content = <OperationsHome events={data.events} registrations={data.registrations} go={go} userName={userName} />;

  return <div className="ap-root">
    <a className="ap-skip" href="#admin-preview-content">Skip to content</a>
    <Sidebar activeWorkspace={activeWorkspace} setActiveWorkspace={setActiveWorkspace} page={page} go={go} open={sidebarOpen} setOpen={setSidebarOpen} session={effectiveSession} />
    <div className="ap-app"><Topbar onMenu={() => setSidebarOpen(true)} scopes={scopes} scope={scope} setScope={setScope} onCommand={() => setCommandOpen(true)} onReload={REFRESH_WORKSPACE_PAGES.includes(page) ? () => setPlayerRefresh(n => n + 1) : data.reload} />
      <main id="admin-preview-content" className="ap-main" tabIndex="-1"><ScreenReaderStatus>{RECORD_WORKSPACE_PAGES.includes(page) ? `${page === 'email' ? 'Email broadcast' : page} workspace` : data.loading ? 'Loading records' : `${data.events.length} events and ${data.registrations.length} registrations loaded`}</ScreenReaderStatus>{!RECORD_WORKSPACE_PAGES.includes(page) && data.error && !focusEventId && <div className="ap-data-notice"><AlertCircle size={16} /><span><b>Live data unavailable.</b> Live data could not be loaded: {data.error}</span></div>}<AnimatePresence mode="wait" initial={false}><Motion.div key={`${activeWorkspace}-${page}-${focusEventId || 'all'}`} className="ap-screen" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: reduceMotion ? .1 : .18 }}>{content}</Motion.div></AnimatePresence></main>
    </div>
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} events={data.events} registrations={data.registrations} go={go} />
  </div>;
}
