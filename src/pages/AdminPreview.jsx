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
import NativeDrawOperationsDialog from './admin-preview/NativeDrawOperationsDialog.jsx';
import EventDrawWorkspace, { currentDrawForDivision } from './admin-preview/EventDrawWorkspace.jsx';
import { isAvailableSolo } from "../utils/pairEventEntries.js";
import EventRemovalDialog from "./admin-preview/EventRemovalDialog.jsx";
import EventMoveDialog from "./admin-preview/EventMoveDialog.jsx";
import EventTeamDivisions from './admin-preview/EventTeamDivisions.jsx';
import { groupTeamDivisions, registrationRanking, currentDivisionLabel } from './admin-preview/teamDivisions.js';
import { resolveRegistrationDivision, registrationsShareDivision, registrationMatchesDivision } from '../utils/registrationDivision.js';
import { saveEventEntry } from './admin-preview/saveEventEntry';
import EventEntryForm, { EventEntryPaymentLinks } from './admin-preview/EventEntryForm.jsx';
import EventReplacementDialog from './admin-preview/EventReplacementDialog.jsx';
import EventRehearsal, { EventRehearsalWorkspace } from './admin-preview/EventRehearsal.jsx';
import EventGroupDrawDialog from './admin-preview/EventGroupDrawDialog.jsx';
import { registrationPaymentLink } from '../utils/provisionalEntry.js';
import { calculateEventSettlement } from '../utils/eventSettlement.js';
import RegistrationsWorkspace from './admin-preview/RegistrationsWorkspace.jsx';
import { safeCsvCell } from './admin-preview/registrationExports.js';
import EventPaymentDialog from './admin-preview/EventPaymentDialog.jsx';
import RecordLoading from './admin-preview/RecordLoading.jsx';
import { CreateEventMenu, ReviewNotifications } from './admin-preview/ReviewNavigationDialogs.jsx';
import MessagingWorkspace from './admin-preview/MessagingWorkspace.jsx';
import HelpRequestsWorkspace from './admin-preview/HelpRequestsWorkspace.jsx';
import AccountSecurityWorkspace from './admin-preview/AccountSecurityWorkspace.jsx';
import ReviewSettingsWorkspace from './admin-preview/ReviewSettingsWorkspace.jsx';
import ReviewBlogWorkspace from './admin-preview/ReviewBlogWorkspace.jsx';
import ReviewAuditWorkspace from './admin-preview/ReviewAuditWorkspace.jsx';
import EventActivityLog from './admin-preview/EventActivityLog.jsx';
import { loadEventActivity } from './admin-preview/reviewAuditData.js';
import ReviewIntegrationsWorkspace from './admin-preview/ReviewIntegrationsWorkspace.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion as Motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, ArrowRight, Banknote, Bell, Building2, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Clock3,
  Command, CreditCard, Download, ExternalLink, FileText, GalleryVerticalEnd,
  LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Mail, MapPin, Menu, MessageSquare,
  MoreHorizontal, Network, Plus, Radio, RefreshCw, Search, Settings2, ShieldCheck,
  Trophy, UserPlus, FileSpreadsheet, Shuffle, Trash2, Link2,
  Users, WalletCards, X, Zap, Info, RotateCcw, KeyRound,
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { FOURM_PUBLIC_ORIGIN } from '../constants/site.js';
import AccessWorkspace from './admin-preview/AccessWorkspace';
import { canOpenReviewPage, canReadPreviewEvents, restrictPreviewEvents, previewScopes } from './admin-preview/access';
import {
  findPaymentForRegistration, getRegistrationEntryFeePaid,
  isExplicitAdminMarkedPayment, isLicensePaymentRow, hasBlockingProcessedRefund, normalizePaymentMetadata,
  isPaystackPaymentMethod, registrationCountsAsPaid,
  registrationIsCompedEntry, resolveRegistrationPaymentMethod, resolveRegistrationPayer,
} from '../utils/paymentRegistrationMatch';
import { canCorrectManualPayment } from '../utils/manualPaymentCorrection.js';
import { resolveRegistrationLicenseCategory } from '../utils/registrationLicense';
import { buildPlayersByEmailMap } from '../utils/playerLookup';
import { readEventProfiles } from './admin-preview/eventSnapshots';
import { hydrateEventLicenses } from './admin-preview/eventLicenseData.js';
import EventPlayerAvatar from './admin-preview/EventPlayerAvatar';
import EventIncomeStatement from './admin-preview/EventIncomeStatement.jsx';
import { ledgerRegistrations, sessionIdentity } from './admin-preview/eventLedger';
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
import { payoutScope } from './admin-preview/payoutOperations.js';
import FederationsWorkspace from './admin-preview/FederationsWorkspace.jsx';
import GalleryWorkspace from './admin-preview/GalleryWorkspace.jsx';
import EmailBroadcastWorkspace from './admin-preview/EmailBroadcastWorkspace.jsx';
import PushBroadcastWorkspace from './admin-preview/PushBroadcastWorkspace.jsx';
import LicensesWorkspace from './admin-preview/LicensesWorkspace.jsx';
import TournamentAdminWorkspace from './admin-preview/TournamentAdminWorkspace.jsx';
import { eventTournamentWorkspaces } from './admin-preview/tournament/utils/tournament/permissions.js';
import { eventRankedinId } from './admin-preview/rankedinSync.js';
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
const EMPTY_RELATED = { payments: [], divisions: [], activity: [], draws: [], refunds: [] };
const RECORD_WORKSPACE_PAGES = ['messaging', 'help', 'security', 'settings', 'blog', 'audit-log', 'integrations', 'players', 'calendar', 'coaches', 'clubs', 'organisations', 'federations', 'reports', 'payments', 'payouts', 'team-access', 'gallery', 'email', 'push', 'licenses', 'tournaments'];
const REFRESH_WORKSPACE_PAGES = RECORD_WORKSPACE_PAGES;

const WORKSPACES = [
  { id: 'operate', label: 'Operate', icon: Zap, caption: 'Run events', items: [
    { label: 'Dashboard', icon: LayoutDashboard, page: 'home' },
    { label: 'Event manager', icon: Trophy, page: 'events', activePages: ['events', 'event'] },
    { label: 'Tournament Manager', icon: Trophy, page: 'tournaments' },
    { label: 'Registrations', icon: FileText, page: 'registrations', activePages: ['registrations', 'payment', 'player'] },
    { label: 'Calendar', icon: CalendarDays, page: 'calendar' },
    { label: 'Messaging', icon: MessageSquare, page: 'messaging' },
    { label: 'Help requests', icon: Bell, page: 'help' },
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
    { label: 'Push broadcasts', icon: Bell, page: 'push' },
    { label: 'Blog', icon: FileText, page: 'blog' },
  ] },
  { id: 'system', label: 'System', icon: Settings2, caption: 'Access and configuration', items: [
    { label: 'Access & permissions', icon: ShieldCheck, page: 'team-access' },
    { label: 'Integrations', icon: Link2, page: 'integrations' },
    { label: 'Settings', icon: Settings2, page: 'settings' },
    { label: 'Audit log', icon: Clock3, page: 'audit-log' },
    { label: 'Account security', icon: KeyRound, page: 'security' },
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

function usePreviewData(session, permissions, forceFixture = false, focusEventId = null, publicLive = false, scope = null, loadEntries = true) {
  const identity = sessionIdentity(session);
  const request = useRef(0);
  const accessKey = `${identity}|${JSON.stringify(permissions)}|${scope?.id}|${focusEventId}|${forceFixture}|${loadEntries}`;
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
      if (!canReadPreviewEvents(permissions, scope)) throw new Error('Event Manager access is required.');
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
      if (loadEntries && eventIds.length) {
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
        const canReadFinance = !publicLive && permissions.role === 'super_admin';
        const [paymentResult, divisionResult, activityResult, drawResult] = await Promise.all([
          !canReadFinance ? [] : readAll(() => supabase.from('payments').select('*').eq('event_id', focusEventId).order('id')),
          readAll(() => supabase.from('tournament_divisions').select('*').eq('event_id', focusEventId).order('id')),
          publicLive ? [] : loadEventActivity(supabase, focusEventId, canReadFinance && scope?.id === 'all'),
          readAll(() => supabase.from('draws').select('id, event_id, division_id, draw_kind, format, status, generated_at, public_announcement, tournament_divisions(name)').eq('event_id', focusEventId).order('id')),
        ]);
        payments = paymentResult;
        divisions = divisionResult;
        activity = activityResult;
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
  }, [identity, permissions, forceFixture, focusEventId, publicLive, scope, accessKey, loadEntries]);
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

function Sidebar({ activeWorkspace, workspaces, setActiveWorkspace, page, go, open, setOpen, session, currentAdminUrl }) {
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
          <LayoutGroup id="workspaces">{workspaces.map(({ id, label, icon: Icon, caption, items }) => (
            <section className={`ap-nav-group ${activeWorkspace === id ? 'is-active' : ''}`} key={id}>
              <button className="ap-workspace-heading" onClick={() => { setActiveWorkspace(id); setOpen(false); }} aria-expanded="true">
                {React.createElement(Icon, { size: 16, 'aria-hidden': true })}<span><b>{label}</b><small>{caption}</small></span>
              </button>
              <div className="ap-nav-destinations">{items.map((item) => {
                const ItemIcon = item.icon;
                const activePages = item.activePages || [item.page];
                const isActive = activeWorkspace === id && activePages.includes(page);
                return <button key={item.label} className={`ap-nav-destination ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={() => openDestination(id, item)}>
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
          <a href={currentAdminUrl} aria-label="Open current admin"><ExternalLink size={16} /></a>
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

function CommandPalette({ open, onClose, events, registrations, workspaces, go }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const commands = useMemo(() => [
    ...workspaces.flatMap(workspace => workspace.items.map(item => ({
      id: item.page, label: item.label, type: workspace.label, icon: item.icon, run: () => go(item.page),
    }))),
    ...events.slice(0, 8).map((item) => ({ id: `event-${item.id}`, label: item.event_name || item.title || 'Untitled event', type: 'Event', icon: CalendarDays, run: () => go('event', { event: item }) })),
    ...registrations.slice(0, 8).map((item) => ({ id: `reg-${item.id}`, label: `${personName(item)}, ${item.id}`, type: 'Registration', icon: Users, run: () => go('registrations', { registration: item }) })),
  ], [events, registrations, workspaces, go]);
  const results = commands.filter((item) => `${item.label} ${item.type}`.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
  return <AnimatePresence>{open && <Motion.div className="ap-command-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <button className="ap-command-dismiss" aria-label="Close command palette" onClick={onClose} />
    <Motion.div className="ap-command" role="dialog" aria-modal="true" aria-label="Search and commands" initial={{ opacity: 0, y: -12, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .99 }} transition={{ type: 'spring', duration: .28, bounce: 0 }}>
      <div className="ap-command-input"><Search size={20} /><label className="ap-visually-hidden" htmlFor="admin-command-search">Search records and actions</label><input ref={inputRef} id="admin-command-search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && results[0]) { event.preventDefault(); results[0].run(); onClose(); }
      }} placeholder="Search workspaces and loaded records…" /><kbd>ESC</kbd></div>
      <div className="ap-command-results">
        {results.length ? results.map(({ id, label, type, icon: Icon, run }) => <button key={id} onClick={() => { run(); onClose(); }}>{React.createElement(Icon, { size: 17 })}<span><b>{label}</b><small>{type}</small></span><ArrowRight size={15} /></button>) : <div className="ap-empty-compact"><Search size={22} /><b>No matching records</b><span>Try a player, event or registration name.</span></div>}
      </div>
      <div className="ap-command-foot"><span><kbd>↵</kbd> Open</span><span><kbd>Tab</kbd> Navigate</span><span>Preview search includes loaded records</span></div>
    </Motion.div>
  </Motion.div>}</AnimatePresence>;
}

function Topbar({ onMenu, scopes, scope, setScope, onCommand, onReload, onNotifications, onCreate }) {
  return <header className="ap-topbar">
    <button className="ap-icon-button ap-mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
    <ScopeSwitcher scopes={scopes} scope={scope} setScope={setScope} />
    <button className="ap-search-button" onClick={onCommand}><Search size={18} /><span>Find a workspace</span><kbd><Command size={11} />K</kbd></button>
    <div className="ap-top-actions">
      <PreviewTag />
      <button className="ap-icon-button" onClick={onReload} aria-label="Reload live data"><RefreshCw size={17} /></button>
      {onNotifications && <button className="ap-icon-button" aria-label="Open notifications" onClick={onNotifications}><Bell size={18} /></button>}
      {onCreate && <button className="ap-primary ap-create" onClick={onCreate}><Plus size={18} /> Create</button>}
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

function OperationsHome({ events, registrations, go, userName, canReadEvents }) {
  if (!canReadEvents) return <PageHeading eyebrow="Operations" title={`Good morning, ${userName}.`}
    description="Open an assigned workspace from the sidebar." />;
  const failures = registrations.filter((row) => normalizePayment(row) === 'failed');
  const pending = registrations.filter((row) => ['needs_review', 'pending', 'incomplete'].includes(String(row.status || '').toLowerCase()));
  const draftEvent = events.find((event) => !event.is_visible);
  const eventById = new Map(events.map(event => [String(event.id), event]));
  const attention = [
    ...failures.slice(0, 2).map((row) => ({ id: `fail-${row.id}`, type: 'payment', title: 'Recover declined payment', detail: `${personName(row)}, ${registrationDivision(row)}`, context: eventById.get(String(row.event_id))?.event_name || 'Event registration', age: '2h', priority: 'High', tone: 'danger', target: 'payment', payload: { event:eventById.get(String(row.event_id)), registration: row } })),
    ...pending.slice(0, 2).map((row) => ({ id: `reg-${row.id}`, type: 'registration', title: 'Review registration', detail: `${personName(row)}, ${registrationDivision(row)}`, context: eventById.get(String(row.event_id))?.event_name || 'Event registration', age: '5h', priority: 'Medium', tone: 'warning', target: 'registrations', payload: { event:eventById.get(String(row.event_id)), registration: row } })),
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

export function EventDemoModal({ action, event, divisions, onClose, onExport, onPaymentAction, onSaveEntry, onMove, onRemove, onPair, onMerge, onSplit, onReplace, onRehearsal, onMessages, onHelp, onEditDetails, onCancelScope, onOpenDraw, canExportFinance = true }) {
  const closeRef = useRef(null);
  const reduceMotion = useReducedMotion();
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
    add: 'Add player or team', sync: 'Sync to RankedIn', export: 'Export event',
    move: 'Move registration', remove: 'Remove registration', draw: 'Draw details', team: 'Team details', settings: 'Event options',
  };
  return <Motion.div className="ap-modal-layer" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .16 }}>
    <button className="ap-modal-scrim" aria-label="Close dialog" disabled={entryBusy} onClick={closeEntry} />
    <Motion.section className={`ap-modal${action?.type === 'note' ? ' ap-note-modal' : action?.type === 'team' ? ' ap-team-details-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby="event-modal-title" initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }} transition={{ duration: reduceMotion ? 0 : .16 }}>
      <header><div><p className="ap-kicker">{eventName(event)}</p><h2 id="event-modal-title">{titleByType[action?.type] || 'Event action'}</h2></div><button ref={closeRef} className="ap-icon-button" disabled={entryBusy} onClick={closeEntry} aria-label="Close dialog"><X size={18} /></button></header>
      {complete ? <div className="ap-modal-success"><CheckCircle2 size={30} /><h3>{entryDraft?.saved ? 'Registration added — payment pending' : entryDraft ? 'Pending entry review' : 'Prototype action complete'}</h3>{entryDraft && <p>{entryDraft.players.map(player => player.name || player.email).join(' / ')} · {entryDraft.division.name || entryDraft.division.division_name} · {formatMoney(entryDraft.amountDue)} due{entryDraft.note && <small> · Note: {entryDraft.note}</small>}</p>}<p>{entryDraft?.saved ? 'Registration saved. Payment can be marked separately.' : 'No live event data was changed. This is a local preview only.'}</p>{entryDraft?.warnings?.map((warning,index)=><p role="status" key={index}>{warning}</p>)}<EventEntryPaymentLinks links={entryDraft?.links}/><button className="ap-primary" onClick={closeEntry}>Done</button></div> : <div className="ap-modal-body">
        {action?.type === 'note' && <div className="ap-payment-note-content"><div className="ap-note-person"><EventPlayerAvatar player={registration?._player} name={personName(registration)} /><div><h3>{personName(registration)}</h3><small>{registrationDivision(registration)}</small></div>{registration?._paymentDisplay && <Status tone={registration._paymentDisplay.tone}>{registration._paymentDisplay.label}</Status>}</div><div className="ap-note-message"><Info size={16} aria-hidden="true" /><p>{displayValue(action.note, 'No payment note recorded.')}</p></div></div>}
        {action?.type === 'add' && <EventEntryForm event={event} divisions={divisions} save={onSaveEntry ? draft => { entrySaveAttempted.current = true; return onSaveEntry(draft); } : undefined} onBusy={setEntryBusy} onReview={draft => { setEntryDraft(draft); setComplete(true); }}/>}
        {action?.type === 'export' && <div className="ap-export-options"><button onClick={() => { onExport('registrations'); closeEntry(); }}><FileSpreadsheet size={21} /><span><b>Registration list</b><small>Players, partners, divisions, payment and licence status</small></span><Download size={16} /></button>{canExportFinance && <button onClick={() => onExport('finance')}><CircleDollarSign size={21} /><span><b>Income statement</b><small>Full and organiser Excel reports</small></span><Download size={16} /></button>}</div>}
        {action?.type === 'draw' && <div className="ap-action-review"><Status tone={action.draw?.status === 'completed' ? 'positive' : 'neutral'}>{action.draw?.status || 'Not generated'}</Status><dl className="ap-details-list"><div><dt>Division</dt><dd>{action.division?.name || action.division?.division_name}</dd></div><div><dt>Format</dt><dd>{action.draw?.format || action.division?.format || 'Knockout'}</dd></div><div><dt>Draw type</dt><dd>{action.draw?.draw_kind || 'Main draw'}</dd></div><div><dt>Generated</dt><dd>{action.draw?.generated_at ? formatDate(action.draw.generated_at) : 'Not recorded'}</dd></div></dl>{onOpenDraw && (action.draw || action.division?.is_active !== false)
          ? <button className="ap-primary" type="button" onClick={() => onOpenDraw(action.division)}>{action.draw ? 'Manage draw' : 'Draw generator'}</button>
          : <p>Draw changes require Tournament Manager access for this division.</p>}</div>}
        {action?.type === 'team' && <div className="ap-action-review ap-team-modal">
          <div className="ap-team-modal-head"><div><p className="ap-kicker">{currentDivisionLabel(registration, divisions, registrationDivision)}</p><h3>{action.team.length > 1 ? `${personName(action.team[0])} / ${personName(action.team[1])}` : personName(registration)}</h3></div><Status tone={action.team.every((member) => member._paymentDisplay?.label === 'Paid') ? 'positive' : 'warning'}>{action.team.every((member) => member._paymentDisplay?.label === 'Paid') ? 'Team settled' : 'Needs attention'}</Status></div>
          <div className="ap-team-members">{action.team.map((member, index) => {
            const eligibility = registrationEligibility(member);
            const payment = member._paymentDisplay || { label: normalizePayment(member), tone: 'warning', detail: '' };
            return <article className="ap-team-member" key={member.id || `${personName(member)}-${index}`}><div className="ap-player-modal-title"><EventPlayerAvatar player={member._player} name={personName(member)} /><div><small>{index === 0 ? 'Player' : 'Partner'}</small><h3>{personName(member)}</h3><p>{member.email || 'Contact details protected'}</p></div></div><dl><div><dt>Ranking points</dt><dd title={registrationRanking(member, divisions).label}>{registrationRanking(member, divisions).points.toLocaleString('en-ZA')}</dd></div><div><dt>Licence</dt><dd><Status tone={eligibility.tone}>{eligibility.label}</Status></dd></div><div><dt>Payment</dt><dd><Status tone={payment.tone}>{payment.label}</Status>{payment.detail && <small className={`ap-payment-source ap-payment-source--${payment.detailTone || 'neutral'}`}>{payment.detail}</small>}</dd></div><div><dt>Amount paid</dt><dd>{member._entryAmount == null ? 'Not available' : formatMoney(member._entryAmount)}</dd></div></dl>{onPaymentAction && <div className="ap-player-payment-actions">{!['Paid', 'Comped'].includes(payment.label) ? <><button className="ap-secondary" onClick={() => onPaymentAction(member, 'paid')}>Mark as paid</button><button className="ap-secondary" onClick={() => onPaymentAction(member, 'comp')}>Complimentary entry</button></> : <>{member._editablePayment && <button className="ap-secondary" onClick={() => onPaymentAction(member, 'correct')}>Edit payment</button>}{member._canUnmark && <button className="ap-secondary" onClick={() => onPaymentAction(member, 'unmark')}>{payment.label === 'Comped' ? 'Remove comp' : 'Unmark manual payment'}</button>}</>}</div>}</article>;
          })}</div>
          <div className="ap-team-totals"><span><small>Team points</small><b>{action.team.reduce((sum, member) => sum + registrationRanking(member, divisions).points, 0).toLocaleString('en-ZA')}</b></span><span><small>Entry fees paid</small><b>{action.team.some(member => member._entryAmount == null) ? 'Not available' : formatMoney(action.team.reduce((sum, member) => sum + Number(member._entryAmount), 0))}</b></span><span><small>Registration</small><b>{registration?.status || 'Registered'}</b></span></div>
          <div className="ap-modal-actions">{onMerge && <button className="ap-primary" onClick={() => onMerge(registration)}>Merge existing entries</button>}{onSplit && <button className="ap-secondary" onClick={() => onSplit(registration)}>Split team</button>}{onReplace && <button className="ap-secondary" onClick={() => onReplace(action.team, registration)}>Replace player</button>}{onPair && <button className="ap-primary" onClick={() => onPair(registration)}><UserPlus size={15} /> Invite from directory</button>}{onMove && <button className="ap-secondary" onClick={() => onMove(action.team)}><Shuffle size={15} /> Move whole team</button>}{onRemove && <button className="ap-danger-button" onClick={() => onRemove(action.team)}><Trash2 size={15} /> Remove whole team</button>}</div>
        </div>}
        {action?.type === 'settings' && <div className="ap-export-options">{onEditDetails && <button onClick={onEditDetails}><Settings2 size={21} /><span><b>Edit event details</b><small>Event setup, schedule, registration and division settings</small></span><ChevronRight size={16} /></button>}<a className="ap-secondary" href={`${FOURM_PUBLIC_ORIGIN}/calendar/${encodeURIComponent(event.slug || event.id)}`} target="_blank" rel="noreferrer"><Link2 size={21} /> Open public event page <ExternalLink size={16} /></a>{onCancelScope && event.event_status !== "cancelled" && <><button className="ap-event-cancel-option" onClick={() => onCancelScope("division")}><Trash2 size={21}/><span><b>Cancel division</b><small>Close a division and refund eligible entries</small></span><ChevronRight size={16}/></button><button className="ap-event-cancel-option" onClick={() => onCancelScope("event")}><Trash2 size={21}/><span><b>Cancel event</b><small>Withdraw all entries and request eligible refunds</small></span><ChevronRight size={16}/></button></>}{onMessages && <button onClick={onMessages}><MessageSquare size={21} /><span><b>Event messages</b><small>Open messages for this event</small></span><ChevronRight size={16} /></button>}{onHelp && <button onClick={onHelp}><Info size={21} /><span><b>Help requests</b><small>Review support requests for this event</small></span><ChevronRight size={16} /></button>}{onRehearsal && <button onClick={onRehearsal}><Trophy size={21} /><span><b>Start private rehearsal</b><small>Practise draws, scheduling and scores on a private copy</small></span><ChevronRight size={16} /></button>}</div>}
      </div>}
    </Motion.section>
  </Motion.div>;
}

export function LiveEventCommandCentre({ event, registrations, payments, divisions, activity, draws = [], refunds = [], go, financeRestricted = false, canReadEventStatement = false, canManagePayments = false, canOperateHostDraw = false, session, scopeId = 'all', client = supabase, canRehearse = false, onOpenMessages, onOpenHelp, onOpenTournament, tournamentWorkspaces = [], onOpenPayouts, onOpenFinance, initialTab, initialAction, initialRegistrationId, onRefresh }) {
  const [tab, setTab] = useState(({ statement: 'Income statement', draws: 'Draws' })[initialTab] || 'Overview');
  const [action, setAction] = useState(null);
  const [paymentAction, setPaymentAction] = useState(null);
  const [moveAction, setMoveAction] = useState(null);
  const [removeAction, setRemoveAction] = useState(null);
  const [pairTarget, setPairTarget] = useState(null);
  const [teamOperation, setTeamOperation] = useState(null);
  const [replacement, setReplacement] = useState(null);
  const [rehearsing, setRehearsing] = useState(false);
  const [groupDraw, setGroupDraw] = useState(null);
  const [drawOperations, setDrawOperations] = useState(false);
  const handledRegistrationLink = useRef(null);
  const [operationAccess, setOperationAccess] = useState(false);
  const [completion, setCompletion] = useState({ loading: true });
  useEffect(() => {
    let alive = true; setOperationAccess(false); setCompletion({ loading: true });
    if (!session?.user?.id) { setCompletion({ loading: false }); return; }
    verifyEventOperationAccess({ client, eventId: event.id, expectedUserId: session.user.id, scopeId })
      .then(async () => { if (!alive) return; setOperationAccess(true); const map = await loadManagedEventCompletions(client, [event.id]); if (alive) setCompletion({ loading: false, value: map.get(Number(event.id)) || null }); })
      .catch(error => { if (alive) setCompletion({ loading: false, error: error.message }); });
    return () => { alive = false; };
  }, [client, event.id, session?.user?.id, scopeId]);
  const managedEvent = { ...event, management_completed_at: completion.value || null };
  const canAddEntry = operationAccess && event.event_status !== 'cancelled';
  const canSyncRankedin = canManagePayments && Boolean(eventRankedinId(event));
  const hasActiveNativeDraw = draws.some(draw => ['published', 'in_progress'].includes(draw.status));
  const canOperateNativeDraw = (canManagePayments || canOperateHostDraw && hasActiveNativeDraw) && canAddEntry && event.is_manual;
  const openRehearsal = canRehearse && event.is_manual ? () => { setAction(null); setRehearsing(true); } : undefined;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelScope, setCancelScope] = useState(null);
  const [query, setQuery] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('All licences');
  const [divisionFilter, setDivisionFilter] = useState('All divisions');
  const rawActiveRegistrations = activeEventEntries(registrations);
  // Aggregate screenshot totals cannot establish an individual player's licence.
  const activeRegistrations = rawActiveRegistrations;
  const divisionLabelFor = row => currentDivisionLabel(row, divisions, registrationDivision);
  const divisionFeeFor = (row) => {
    const division = resolveRegistrationDivision(row, divisions);
    return Number(division?.entry_fee ?? event.category_fees?.[registrationDivision(row)] ?? event.entry_fee ?? 0);
  };
  const successPayments = payments.filter((payment) => String(payment.status || '').toLowerCase() === 'success');
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
  const settlement = calculateEventSettlement({
    event, registrations: activeRegistrations, divisions, payments, refunds, entryFeeForRegistration: divisionFeeFor,
  });
  const finance = {
    totalEntries: settlement.activeEntries,
    grossCollected: settlement.cashHistory.grossEntryFees,
    entryRefunds: settlement.entryFeesRefunded,
    netEntryIncome: settlement.cashHistory.grossEntryFees - settlement.entryFeesRefunded,
    outstanding: settlement.pendingAmount,
    paid4M: settlement.paid4M,
    paidManual: settlement.paidClub,
    pending: settlement.pendingCount,
    comped: settlement.compedEntries,
  };
  const collected = finance.grossCollected;
  const outstanding = finance.outstanding;
  const uniqueRegistrations = [...new Map(activeRegistrations.map((row) => [String(row.email || personName(row)).toLowerCase().trim(), row])).values()];
  const licenseCounts = uniqueRegistrations.reduce((counts, row) => {
    const license = resolveRegistrationLicenseCategory(row.email, event.id, row._player, payments);
    counts[license] += 1;
    return counts;
  }, { full: 0, temp: 0, none: 0 });
  const hasLicenseBreakdown = uniqueRegistrations.length > 0 && !financeRestricted;
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
      if (String(candidate.id) === String(row.id) || !registrationsShareDivision(candidate, row, divisions)) return false;
      const candidateEmail = String(candidate.email || '').toLowerCase();
      return (partnerEmail && candidateEmail === partnerEmail)
        || (partnerName && personName(candidate).toLowerCase().trim() === partnerName)
        || (rowEmail && String(candidate.partner_email || '').toLowerCase() === rowEmail);
    });
    const members = partner ? [row, partner] : [row];
    return members.map((member) => {
      const payment = paymentFor(member);
      const metadata = normalizePaymentMetadata(payment?.metadata);
      return { ...member, _editablePayment: canManagePayments && canCorrectManualPayment(payment, member) ? payment : null,
        _canUnmark: isExplicitAdminMarkedPayment(payment) && !resolveRegistrationPayer(payment, member).isPartnerPaid, _paymentDisplay: paymentDisplayFor(member), _paymentNote: metadata.note || metadata.payment_note || null, _entryAmount: financeRestricted ? null : entryAmountFor(member) };
    });
  };
  useEffect(() => {
    if (!initialAction && !initialRegistrationId) return;
    const key = `${event.id}:${initialAction || ''}:${initialRegistrationId || ''}`;
    if (handledRegistrationLink.current === key) return;
    if (initialAction === 'add') {
      if (!canAddEntry) return;
      setAction({ type: 'add' });
    } else {
      const linked = registrations.find(row => String(row.id) === initialRegistrationId && String(row.event_id) === String(event.id));
      if (!linked) return;
      setTab('Registrations');
      setAction({ type: 'team', registration: linked, team: teamFor(linked) });
    }
    handledRegistrationLink.current = key;
  }, [event.id, initialAction, initialRegistrationId, canAddEntry, registrations, teamFor]);
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
    const haystack = `${personName(row)} ${row.partner_name || ''} ${row.email || ''} ${divisionLabelFor(row)} ${registrationDivision(row)}`.toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (licenseFilter === 'All licences' || eligibility === licenseFilter)
      && (divisionFilter === 'All divisions' || divisionLabelFor(row) === divisionFilter);
  });
  const filteredIds = new Set(filteredRegistrations.map((row) => String(row.id)));
  const teamGroups = groupTeamDivisions(teams, divisions, registrationDivision, filteredIds, divisionFilter, Boolean(query.trim()) || licenseFilter !== 'All licences');
  const activityItems = activity.filter(row => String(row.event_id) === String(event.id));
  const canReadPrivateActivity = canManagePayments && scopeId === 'all';
  const drawForDivision = division => currentDrawForDivision(draws, division);
  const openDivisionDraw = onOpenTournament && tournamentWorkspaces.includes('draws') ? division => {
    setAction(null);
    onOpenTournament(division, 'draws');
  } : undefined;
  const exportEvent = (kind) => {
    if (kind === 'finance') { setAction(null); setTab('Income statement'); return; }
    const rows = [['Player', 'Partner', 'Division', 'Payment', 'Licence', 'Status'], ...activeRegistrations.map((row) => [personName(row), row.partner_name || '', divisionLabelFor(row), normalizePayment(row), registrationEligibility(row).label, row.status || 'registered'])];
    const csv = rows.map(row => row.map(safeCsvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${eventName(event).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toolbar = <div className="ap-event-toolbar"><label className="ap-filter-search"><Search size={16} /><span className="ap-visually-hidden">Search event players</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search player, partner, email or division" /></label><SearchableDropdown value={licenseFilter} onChange={(e) => setLicenseFilter(e.target.value)} aria-label="Filter by licence"><option>All licences</option><option>Full licence</option><option>Temporary</option><option>No licence</option><option>Not available</option></SearchableDropdown><SearchableDropdown value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} aria-label="Filter by division"><option>All divisions</option>{divisions.map((division) => <option key={division.id}>{division.name || division.division_name}</option>)}</SearchableDropdown></div>;

  const overview = <div className="ap-command-centre-grid ap-live-event-grid">
    <section className="ap-section ap-live-summary"><div className="ap-section-heading"><div><p className="ap-kicker">Event outcome</p><h2>{phase.label} operations</h2></div><Status tone={event.sapa_status ? tierTone(event.sapa_status) : phase.tone}>{event.sapa_status || phase.label}</Status></div><div className="ap-health-grid"><div><strong>{finance.totalEntries}</strong><span>Player entries</span><small>{finance.uniquePlayers} unique players</small></div><div><strong>{formatMoney(finance.netEntryIncome)}</strong><span>Net entry income</span><small>{formatMoney(collected)} gross collected</small></div><div className={outstanding > 0 ? 'is-risk' : ''}><strong>{formatMoney(outstanding)}</strong><span>Outstanding</span><small>{finance.pending} unpaid {finance.pending === 1 ? 'entry' : 'entries'}</small></div></div><div className="ap-license-strip" aria-label="SAPA licence breakdown"><span className="is-full"><b>{hasLicenseBreakdown ? licenseCounts.full : '-'}</b><small>Full licence</small></span><span className="is-temp"><b>{hasLicenseBreakdown ? licenseCounts.temp : '-'}</b><small>Temporary</small></span><span className="is-none"><b>{hasLicenseBreakdown ? licenseCounts.none : '-'}</b><small>No licence</small></span></div><dl className="ap-details-list ap-event-facts"><div><dt>Dates</dt><dd>{formatDate(event.start_date)} - {formatDate(event.end_date || event.start_date)}</dd></div><div><dt>Organisation</dt><dd>{event.organisations?.name || event.organiser_name || 'Not recorded'}</dd></div><div><dt>Host club</dt><dd>{event.clubs?.short_name || event.clubs?.name || event.venue || 'Not recorded'}</dd></div><div><dt>Venue</dt><dd>{event.venue || event.city || 'Not recorded'}</dd></div><div><dt>Registration closed</dt><dd>{formatDate(event.registration_closes_at)}</dd></div><div><dt>RankedIn</dt><dd>{event.rankedin_id ? `Tournament ${event.rankedin_id}` : 'Not linked'}</dd></div></dl></section>
    <section className="ap-section ap-live-divisions"><div className="ap-section-heading"><div><p className="ap-kicker">Competition</p><h2>Divisions</h2></div><button className="ap-text-button" onClick={() => setTab('Draws')}>View draws <ArrowRight size={15} /></button></div><div className="ap-division-list">{divisions.length ? divisions.map((division) => { const name = division.name || division.division_name || 'Unnamed division'; const count = activeRegistrations.filter((row) => registrationMatchesDivision(row, division, divisions)).length; return <button className="ap-division-button" key={division.id || name} onClick={() => setAction({ type: 'draw', division, draw: drawForDivision(division) })}><span><b>{name}</b><small>{division.format || division.type || 'Tournament division'}</small></span><strong>{count}<small> entries</small></strong><ChevronRight size={16} /></button>; }) : <div className="ap-empty-inline">No division records were returned.</div>}</div></section>
    <section className="ap-section ap-operational-feed"><div className="ap-section-heading"><div><p className="ap-kicker">Registration ledger</p><h2>Entry health</h2><button className="ap-text-button" onClick={() => setTab('Solo entries')}>{soloEntries.length} solo entries · View players <ArrowRight size={15} /></button></div><button className="ap-text-button" onClick={() => setTab('Registrations')}>Open registrations <ArrowRight size={15} /></button></div><div className="ap-ledger-summary"><span><b>{finance.paid4M + finance.paidManual}</b> paid</span><span><b>{paymentIssues.length}</b> outstanding</span><span><b>{registrations.length - rawActiveRegistrations.length}</b> withdrawn</span></div>{paymentIssues.length > 0 ? <button className="ap-inline-alert" onClick={() => setTab('Needs attention')}><AlertCircle size={19} /><span><b>{paymentIssues.length} registration{paymentIssues.length === 1 ? '' : 's'} need attention</b><small>Inspect payment and eligibility state.</small></span><ArrowRight size={17} /></button> : <div className="ap-clear-state"><CheckCircle2 size={17} /><span><b>No open payment exceptions</b><small>The loaded registration ledger is settled.</small></span></div>}</section>
    <section className="ap-section ap-activity"><div className="ap-section-heading"><div><p className="ap-kicker">Audit trail</p><h2>Latest activity</h2></div><button className="ap-text-button" onClick={() => setTab('Activity log')}>View all</button></div><ol>{activityItems.slice(0, 4).map((item) => <li key={item.id}><span /><div><b>{displayValue(item.summary || item.action, 'Event update')}</b><small>{formatDate(item.created_at)}, {displayValue((canReadPrivateActivity && item.actor_email) || item.actor_role, 'System')}</small></div></li>)}</ol></section>
  </div>;

  const players = <><div className="ap-tab-heading"><div><h2>Teams</h2><button className="ap-text-button" onClick={() => setTab('Solo entries')}>{soloEntries.length} solo entries · View players <ArrowRight size={15} /></button><p>Teams, payments, licence types and management actions in one operational view.</p></div>{canAddEntry && <button className="ap-primary" onClick={() => setAction({ type: 'add' })}><UserPlus size={16} /> Add player / team</button>}</div>{toolbar}<EventTeamDivisions groups={teamGroups} formatMoney={formatMoney} renderTeam={({ players: team, seed, totalPoints }) => {
    const lead = team[0];
    return <div className="ap-team-row" key={team.map((member) => member.id).join('-')}><button className="ap-team-ident" onClick={() => setAction({ type: 'team', registration: lead, team })}><span>{seed || '—'}</span><i>{totalPoints.toLocaleString('en-ZA')}</i></button><button className="ap-team-names" onClick={() => setAction({ type: 'team', registration: lead, team })}>{team.map((member) => <span className="ap-event-person" key={member.id}><EventPlayerAvatar player={member._player} name={personName(member)} /><span><b>{personName(member)}</b><small>{member.email || 'Contact protected'}</small></span></span>)}</button><span className="ap-stacked-status ap-team-payment-status">{team.map((member) => <span key={member.id}><Status tone={member._paymentDisplay.tone}>{member._paymentDisplay.label}</Status><small className={`ap-payment-source ap-payment-source--${member._paymentDisplay.detailTone || 'neutral'}`}>{member._paymentDisplay.detail}</small>{member._paymentNote && <button className="ap-note-trigger" title="View payment note" aria-label={`Payment note for ${personName(member)}`} onClick={() => setAction({ type: 'note', registration: member, note: member._paymentNote })}><Info size={16} aria-hidden="true" /></button>}{canManagePayments && member._canUnmark && member._paymentDisplay.label === 'Comped' && <button className="ap-comp-remove" onClick={() => setPaymentAction({ type: 'unmark', registration: member })}><RotateCcw size={12} aria-hidden="true" />Remove comp</button>}</span>)}</span><span className="ap-team-amounts">{team.map((member) => <b key={member.id}>{member._entryAmount == null ? 'Not available' : formatMoney(member._entryAmount)}</b>)}</span><span className="ap-stacked-status">{team.map((member) => { const eligibility = registrationEligibility(member); return <Status key={member.id} tone={eligibility.tone}>{eligibility.label}</Status>; })}</span><span className="ap-row-actions">{canManagePayments && <button onClick={() => setMoveAction(team)}><Shuffle size={14} /> Move</button>}{canManagePayments && <button className="is-danger" onClick={() => setRemoveAction(team)}><Trash2 size={14} /> Remove</button>}</span></div>;
  }} /><p className="ap-table-foot">Teams use the division’s selected ranking source. Missing category rankings count as zero. Click a team to inspect both players.</p></>;

  const registrationList = <><div className="ap-tab-heading"><div><h2>Registrations list</h2><p>Review the player record, partner, licence and payment source together.</p></div><button className="ap-secondary" onClick={() => go('registrations', { event })}>Open full workspace <ExternalLink size={15} /></button></div>{toolbar}<section className="ap-section ap-event-demo-table"><div className="ap-registration-demo-row ap-event-demo-head"><span>Player</span><span>Partner</span><span>Division</span><span>Licence</span><span>Payment</span><span>Submitted</span><span /></div>{filteredRegistrations.slice(0, 50).map((row) => { const payment = paymentDisplayFor(row); return <button className="ap-registration-demo-row" key={row.id} onClick={() => setAction({ type: 'team', registration: row, team: teamFor(row) })}><span className="ap-registration-person"><EventPlayerAvatar player={row._player} name={personName(row)} /><span><b>{personName(row)}</b><small>{row.email || 'Contact protected'}</small></span></span><span className="ap-registration-person"><EventPlayerAvatar player={teamFor(row).find(member => member.id !== row.id)?._player || row._partnerPlayer} name={row.partner_name || 'Partner needed'} /><span><b>{row.partner_name || 'Partner needed'}</b><small>{row.partner_email || ''}</small></span></span><span><b>{registrationDivision(row)}</b></span><Status tone={registrationEligibility(row).tone}>{registrationEligibility(row).label}</Status><span className="ap-payment-cell"><Status tone={payment.tone}>{payment.label}</Status><small className={`ap-payment-source ap-payment-source--${payment.detailTone || 'neutral'}`}>{payment.detail}</small></span><span><b>{formatDate(row.created_at, { year: undefined })}</b><small>Online entry</small></span><ChevronRight size={16} /></button>; })}</section><p className="ap-table-foot">Showing {Math.min(50, filteredRegistrations.length)} of {filteredRegistrations.length} matching registrations.</p></>;

  const drawWorkspace = <EventDrawWorkspace event={event} divisions={divisions} draws={draws} tournamentWorkspaces={tournamentWorkspaces}
    registrationCount={division => activeRegistrations.filter(row => registrationMatchesDivision(row, division, divisions)).length}
    onOpenTournament={onOpenTournament} onDrawDetails={(division, draw) => setAction({ type: 'draw', division, draw })}
    onGroupDraw={canAddEntry ? (division, draw) => setGroupDraw({ division, draw }) : undefined}
    onNativeOperations={canOperateNativeDraw ? () => setDrawOperations(true) : undefined}
    onRehearsal={openRehearsal} onRankedinSync={canSyncRankedin ? () => setAction({ type: 'sync' }) : undefined} />;

  const incomeStatement = canReadEventStatement ? <EventIncomeStatement key={`${scopeId}:${event.id}:${session?.user?.id}`}
    client={client} session={session} scopeId={scopeId} eventId={event.id} onRequestPayout={onOpenPayouts}
    onRegistration={row => { const registration = registrations.find(candidate => candidate.id === row.id) || row; setAction({ type: 'team', registration, team: teamFor(registration) }); }}/>
    : <section className="ap-section ap-live-loading"><h2>Income statement access is required</h2>
      {onOpenFinance && <button className="ap-secondary" onClick={onOpenFinance}>Open finance reports</button>}</section>;

  const history = <EventActivityLog event={event} activity={activityItems} includePrivate={canReadPrivateActivity} />;
  const attentionList = <EventAttentionList rows={paymentIssues.map(row => ({ id: row.id, name: personName(row), partner: row.partner_name, division: divisionLabelFor(row), issue: paymentDisplayFor(row).detail || 'Payment needs review', eligibility: registrationEligibility(row).label }))} onBack={() => setTab('Overview')} onOpen={id => { const registration = paymentIssues.find(row => row.id === id); if (registration) setAction({ type: 'team', registration, team: teamFor(registration) }); }}/>;
  const soloList = <EventAttentionList solo rows={soloEntries.map(row => ({ id: row.id, name: personName(row), division: divisionLabelFor(row), issue: 'Solo · No partner recorded', eligibility: registrationEligibility(row).label }))} onBack={() => setTab('Overview')} onOpen={id => { const registration = soloEntries.find(row => row.id === id); if (registration) setAction({ type: 'team', registration, team: teamFor(registration) }); }}/>;
  const sections = { 'Solo entries': soloList, Overview: overview, Teams: players, Registrations: registrationList, 'Needs attention': attentionList, Draws: drawWorkspace, 'Income statement': incomeStatement, 'Activity log': history };

  return <><section className="ap-event-demo-header"><div className="ap-event-demo-top"><button className="ap-back-button" onClick={() => go('events')}><ArrowLeft size={16} /> Events</button><div className="ap-event-title"><span>Operate / Events</span><h1>{eventName(event)}</h1><p><CalendarDays size={14} /> {formatDate(event.start_date)} - {formatDate(event.end_date || event.start_date)}<i /><MapPin size={14} /> {event.venue || event.city || 'Venue to confirm'}</p></div><div className="ap-event-demo-actions">{operationAccess && !completion.loading && !completion.error && <EventCompletionControl client={client} session={session} scopeId={scopeId} event={managedEvent} onSaved={receipt => setCompletion({ loading: false, value: receipt.completed_at })} onClose={result => { if (result?.refresh) onRefresh?.(); }} />}{canAddEntry && <button className="ap-primary" onClick={() => setAction({ type: 'add' })}><UserPlus size={16} /> Add player / team</button>}{canSyncRankedin && <button className="ap-secondary" onClick={() => setAction({ type: 'sync' })}><RefreshCw size={16} /> Sync</button>}<button className="ap-secondary" onClick={() => setAction({ type: 'export' })}><Download size={16} /> Export</button><button className="ap-icon-button" onClick={() => setAction({ type: 'settings' })} aria-label="Event options"><MoreHorizontal size={18} /></button></div></div><div className="ap-event-demo-meta"><Status tone={phase.tone}>{phase.label}</Status><span><b>{finance.totalEntries}</b> entries</span><span><b>{finance.paid4M + finance.paidManual}</b> paid</span><span><b>{formatMoney(finance.netEntryIncome)}</b> net entry income</span><span><b>{formatMoney(outstanding)}</b> outstanding</span></div><div className="ap-record-tabs" role="tablist" aria-label="Event record sections">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}{item === 'Teams' && <span>{teams.length}</span>}{item === 'Solo entries' && <span>{soloEntries.length}</span>}{item === 'Needs attention' && <span>{paymentIssues.length}</span>}</button>)}</div></section><AnimatePresence mode="wait" initial={false}><Motion.div key={tab} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .14 }}>{sections[tab]}</Motion.div></AnimatePresence><AnimatePresence>{action && action.type !== 'sync' && <EventDemoModal canExportFinance={canReadEventStatement} action={action} event={event} divisions={divisions} onClose={result => { setAction(null); if (result?.refresh) onRefresh?.(); }} onMove={canManagePayments ? team => { setAction(null); setMoveAction(team); } : undefined} onRemove={canManagePayments ? team => { setAction(null); setRemoveAction(team); } : undefined} onMerge={operationAccess && action?.registration && eligibleRegistrationTeamPartners(action.registration, activeRegistrations, divisions).length ? row => { setAction(null); setTeamOperation({ action: 'merge', registration: row }); } : undefined} onSplit={operationAccess && action?.registration && findRegistrationTeammate(action.registration, activeRegistrations, divisions) ? row => { setAction(null); setTeamOperation({ action: 'split', registration: row }); } : undefined} onPair={canManagePayments && action?.registration && isAvailableSolo(action.registration, activeRegistrations) ? row => { setAction(null); setPairTarget(row); } : undefined} onEditDetails={canManagePayments ? () => { setAction(null); setDetailsOpen(true); } : undefined} onCancelScope={canManagePayments ? scope => { setAction(null); setCancelScope(scope); } : undefined} onSaveEntry={canAddEntry ? draft => saveEventEntry(event, draft, { client, session, scopeId }) : undefined} onReplace={canAddEntry ? (team, registration) => { setAction(null); setReplacement({ team, registration }); } : undefined} onMessages={onOpenMessages} onHelp={onOpenHelp} onRehearsal={openRehearsal} onOpenDraw={openDivisionDraw} onExport={exportEvent} onPaymentAction={canManagePayments ? (member, type) => { setAction(null); setPaymentAction({ registration: member, type }); } : null} />}</AnimatePresence>{canAddEntry && replacement && <EventReplacementDialog client={client} session={session} scopeId={scopeId} event={event} team={replacement.team} initialRegistrationId={replacement.registration.id} onClose={result => { setReplacement(null); if (result?.refresh) onRefresh?.(); }} />}{rehearsing && <EventRehearsal client={client} session={session} event={event} onClose={() => setRehearsing(false)} />}{canOperateNativeDraw && drawOperations && <NativeDrawOperationsDialog client={client} session={session} scopeId={scopeId} event={event} onClose={result => { setDrawOperations(false); if (result?.refresh) onRefresh?.(); }} />}{canAddEntry && groupDraw && <EventGroupDrawDialog client={client} session={session} scopeId={scopeId} event={event} division={groupDraw.division} draw={groupDraw.draw} onClose={result => { setGroupDraw(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && paymentAction && <EventPaymentDialog key={String(paymentAction.registration.id) + paymentAction.type} action={paymentAction} client={client} session={session} scopeId={scopeId} event={event} divisions={divisions} onClose={result => { setPaymentAction(null); if (result?.refresh) onRefresh?.(); }}/>}{canManagePayments && moveAction && <EventMoveDialog event={event} team={moveAction} divisions={divisions} onClose={result => { setMoveAction(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && removeAction && <EventRemovalDialog event={event} team={removeAction} onClose={result => { setRemoveAction(null); if (result?.refresh) onRefresh?.(); }} />}{canSyncRankedin && action?.type === "sync" && <EventRankedinDialog event={event} onClose={result => { setAction(null); if (result?.refresh) onRefresh?.(); }} />}{operationAccess && teamOperation && <EventTeamManagementDialog client={client} session={session} scopeId={scopeId} event={event} registration={teamOperation.registration} action={teamOperation.action} registrations={activeRegistrations} divisions={divisions} onClose={result => { setTeamOperation(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && pairTarget && <EventPairDialog directoryOnly event={event} solo={pairTarget} registrations={activeRegistrations} onClose={result => { setPairTarget(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && cancelScope && <EventCancellationDialog event={event} divisions={divisions} scope={cancelScope} onClose={result => { setCancelScope(null); if (result?.refresh) onRefresh?.(); }} />}{canManagePayments && detailsOpen && <EventDetailsDialog client={client} session={session} scopeId={scopeId} event={event} onClose={result => { setDetailsOpen(false); if (result?.refresh) onRefresh?.(); }} />}</>;
}

function WorkspacePlaceholder({ icon: Icon, title, detail }) { return <section className="ap-section ap-workspace-placeholder">{React.createElement(Icon, { size: 30 })}<h2>{title}</h2><p>{detail}</p><button className="ap-secondary" title="Actions are disabled in this read-only preview">Open workspace</button></section>; }

function PaymentException({ registration, event, payments, go }) {
  if (!registration || !event || String(registration.event_id) !== String(event.id)) {
    return <section className="ap-section ap-live-loading"><h2>Choose a registration to review its payment</h2><button className="ap-secondary" onClick={() => go('registrations')}>Open registrations</button></section>;
  }
  const row = registration;
  const state = normalizePayment(row);
  const payment = findPaymentForRegistration(payments, row);
  const href = ['pending', 'failed', 'unpaid'].includes(state) && String(row.status).toLowerCase() === 'registered' && event.event_status !== 'cancelled'
    ? registrationPaymentLink(event, row) : null;
  const tone = state === 'paid' ? 'positive' : state === 'failed' ? 'danger' : 'warning';
  const viewRegistration = () => go('registrations', { event, registration: row });
  return <>
    <button className="ap-back-button" onClick={viewRegistration}><ArrowLeft size={17} /> Registration {row.id}</button>
    <PageHeading eyebrow={`${eventName(event)} / ${row.id}`} title="Registration payment" description={`${personName(row)} · ${registrationDivision(row)}`}>
      <button className="ap-secondary" onClick={viewRegistration}>View registration</button>
      <Link className="ap-primary" to={`/admin-preview/event?event=${encodeURIComponent(event.id)}&registration=${encodeURIComponent(row.id)}`}>Manage entry</Link>
    </PageHeading>
    <div className="ap-payment-grid">
      <section className="ap-section ap-payment-story"><div className="ap-section-heading"><h2>Payment options</h2><CreditCard size={23} /></div>
        {href ? <EventEntryPaymentLinks links={[{ name: personName(row), href }]} /> : <p>No online retry link is available for this registration.</p>}
      </section>
      <aside className="ap-section ap-payment-summary"><h2>Recorded payment</h2><Status tone={tone}>{state}</Status>
        <dl className="ap-details-list"><div><dt>Reference</dt><dd>{payment?.reference || row.payment_reference || 'Not recorded'}</dd></div><div><dt>Method</dt><dd>{payment?.payment_method || row.payment_method || 'Not recorded'}</dd></div><div><dt>Recorded</dt><dd>{payment?.created_at ? formatDate(payment.created_at) : 'Not recorded'}</dd></div><div><dt>Payment amount</dt><dd>{payment?.amount != null ? formatMoney(payment.amount) : 'Not recorded'}</dd></div></dl>
      </aside>
    </div>
  </>;
}

export default function AdminPreview({ reviewNotice = null, currentAdminUrl = '/admin', session: verifiedSession, permissions: verifiedPermissions, onRefreshPermissions }) {
  const location = useLocation(); const navigate = useNavigate(); const reduceMotion = useReducedMotion();
  const requestedPage = location.pathname.split('/').filter(Boolean)[1];
  const page = requestedPage || 'home';
  const [playerRefresh, setPlayerRefresh] = useState(0);
  const [localSession, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shellDialog, setShellDialog] = useState(null);
  const [bronzePreference, setBronzePreference] = useState(null);
  const session = verifiedSession || localSession;
  const [context, setContext] = useState({ event: null, registration: null });
  const queryParams = new URLSearchParams(location.search);
  const localFixture = import.meta.env.DEV && queryParams.get('preview-fixture') === '1';
  const focusEventId = localFixture ? null : queryParams.get('event');
  const localLivePreview = false;
  const previewBypass = localFixture;
  useEffect(() => {
    if (verifiedSession) return;
    let active = true;
    const update = next => { if (active) { setSession(next); setAuthLoading(false); } };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => update(next));
    supabase.auth.getSession().then(({ data }) => update(data.session)).catch(() => update(null));
    return () => { active = false; subscription.unsubscribe(); };
  }, [verifiedSession]);
  const effectiveSession = useMemo(() => session || (previewBypass ? { user: { email: 'preview@4mpadel.local' } } : null), [session, previewBypass]);
  const { permissions: localPermissions, loading: localPermissionsLoading } = useAdminPermissions(verifiedPermissions || previewBypass ? null : effectiveSession?.user?.email);
  const permissions = verifiedPermissions || localPermissions;
  const permissionsLoading = !verifiedPermissions && localPermissionsLoading;
  const fixturePermissions = useMemo(() => previewBypass ? { role: 'super_admin', orgs: [], clubs: [] } : permissions, [previewBypass, permissions]);
  const canOpen = useCallback(target => canOpenReviewPage(fixturePermissions, target), [fixturePermissions]);
  const workspaces = useMemo(() => WORKSPACES.map(group => ({
    ...group, items: group.items.filter(item => canOpen(item.page)),
  })).filter(group => group.items.length), [canOpen]);
  const [scopeSelection, setScopeSelection] = useState(null);
  const scopes = useMemo(() => previewScopes(fixturePermissions, page), [fixturePermissions, page]);
  const scope = scopes.find(item => scopeSelection?.identity === session?.user?.id && item.id === scopeSelection?.id) || scopes[0];
  const setScope = item => {
    setContext({ event: null, registration: null });
    setCommandOpen(false);
    setScopeSelection({ id: item.id, identity: session?.user?.id });
    const query = new URLSearchParams(location.search);
    for (const key of ['event', 'calendarEvent', 'create', 'action', 'registration', 'detail', 'player', 'ticket', 'division', 'organisation']) query.delete(key);
    navigate({ pathname: location.pathname, search: query.toString() }, { replace: true });
  };
  const mayLoadEvents = ['home', 'events', 'event', 'registrations', 'payment'].includes(page)
    && canOpen(page) && canReadPreviewEvents(fixturePermissions, scope);
  const data = usePreviewData(!mayLoadEvents || permissionsLoading ? null : effectiveSession, fixturePermissions, localFixture, page === 'registrations' ? null : focusEventId, false, scope, page !== 'registrations');
  const activeWorkspace = workspaces.find(workspace => workspace.items.some(item => (item.activePages || [item.page]).includes(page)))?.id || 'operate';
  const setActiveWorkspace = (id) => { const first = workspaces.find(workspace => workspace.id === id)?.items[0]; if (first) go(first.page); };
  const go = useCallback((target, payload = {}) => {
    if (!canOpen(target)) return;
    setContext((current) => ({ event: payload.event || current.event, registration: payload.registration || (target === 'events' ? null : current.registration) }));
    const nextQuery = new URLSearchParams(location.search);
    if (target !== page) {
      nextQuery.delete('event');
      nextQuery.delete('tab');
    }
    nextQuery.delete('create');
    nextQuery.delete('ticket');
    nextQuery.delete('action');
    nextQuery.delete('registration');
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
    if (['event', 'registrations', 'payment', 'tournaments', 'messaging', 'help'].includes(target) && payload.event?.id) nextQuery.set('event', payload.event.id);
    if (['event', 'registrations', 'payment'].includes(target) && payload.registration?.id) nextQuery.set('registration', payload.registration.id);
    nextQuery.delete('organisation');
    if (target === 'payouts') {
      const organisationId = payload.event?.organisation_id || payload.organisationId;
      if (organisationId) nextQuery.set('organisation', organisationId);
      if (payload.event?.id) nextQuery.set('event', payload.event.id);
      else nextQuery.delete('event');
    }
    if (target === 'event' && payload.hostDraw) {
      nextQuery.set('action', 'host-draw');
      nextQuery.set('tab', 'draws');
    }
    if ((target === 'tournaments' || payload.hostDraw) && payload.workspace) nextQuery.set('workspace', payload.workspace);
    if ((target === 'tournaments' || payload.hostDraw) && payload.division) nextQuery.set('division', payload.division);
    if (target === 'calendar' && payload.create) nextQuery.set('create', payload.create);
    if (target === 'calendar' && payload.event?.id) nextQuery.set('calendarEvent', payload.event.id);
    const search = nextQuery.toString();
    navigate(`/admin-preview/${target === 'player' ? 'players' : target}${search ? `?${search}` : ''}`);
  }, [navigate, location.search, canOpen, page]);
  useEffect(() => { const key = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); } }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, []);

  if ((!verifiedSession && !previewBypass && authLoading) || (effectiveSession && permissionsLoading && !previewBypass)) return <main className="ap-loading"><LoaderCircle className="ap-spin" /><p>Preparing your operations brief…</p></main>;
  if (!effectiveSession) return <LoginGate onSession={setSession} />;
  const firstPage = workspaces[0]?.items[0]?.page;
  if (!firstPage) return <main className="ap-denied"><ShieldCheck size={36} /><h1>Admin access is required</h1><p>Your account has no assigned Admin workspaces.</p><a className="ap-primary" href={currentAdminUrl}>Return to current admin</a></main>;
  if (!requestedPage) return <Navigate replace to={`/admin-preview/${canOpen('events') ? 'events' : firstPage}`} />;
  const canSeeWorkspace = canOpen(page) && Boolean(scope);
  const displayedScope = scope || { id: 'all', label: 'My authorised access' };
  const eventListKey = JSON.stringify([session?.user?.id, displayedScope.id]);
  const canCreateEvents = canOpen('calendar') && permissions?.role === 'super_admin' && displayedScope.id === 'all';
  const requestedRegistrationId = queryParams.get('registration') || context.registration?.id;
  const selectedRegistration = requestedRegistrationId == null ? null
    : data.registrations.find(item => String(item.id) === String(requestedRegistrationId));
  const selectedEventId = focusEventId || (page === 'payment' && selectedRegistration?.event_id)
    || context.event?.id || context.registration?.event_id;
  const activeEvent = data.events.find(item => String(item.id) === String(selectedEventId)) || data.events[0];
  const activeRegistration = selectedRegistration && String(selectedRegistration.event_id) === String(activeEvent?.id) ? selectedRegistration : null;
  const canPrepareHostDraw = Boolean(session && !localFixture && focusEventId
    && String(activeEvent?.id) === String(focusEventId) && activeEvent.is_manual && activeEvent.event_status !== 'cancelled'
    && activeEvent.organisation_id && scope?.id === `org:${activeEvent.organisation_id}`
    && permissions?.orgs?.some(org => String(org.id) === String(activeEvent.organisation_id) && ['owner', 'admin'].includes(org.member_role)));
  const hostDrawReturn = focusEventId ? `/admin-preview/event?event=${encodeURIComponent(focusEventId)}&tab=draws` : '/admin-preview/events';
  const userName = effectiveSession.user.email?.split('@')[0]?.split(/[._-]/)[0]?.replace(/^./, (letter) => letter.toUpperCase()) || 'there';
  let content;
  if (!canSeeWorkspace) content = <section className="ap-section"><ShieldCheck size={28}/><h1>Workspace unavailable</h1><p>This account has no access to this workspace.</p><button className="ap-primary" onClick={() => go(firstPage)}>Open my workspace</button></section>;
  else if (page === 'player') content = <Navigate replace to={{ pathname: '/admin-preview/players', search: location.search }} />;
  else if (scope.id !== 'all' && page === 'players') content = <section className="ap-section"><ShieldCheck size={28} /><h2>This workspace is not yet available in {scope.label}</h2><p>Organisation and club access for this module is still being connected.</p><button className="ap-secondary" onClick={() => setScope(scopes[0])}>Return to my authorised access</button></section>;
  else if (permissions?.role === 'private_rehearsal' && page === 'events') content = <EventRehearsalWorkspace client={supabase} session={session} />;
  else if (!localFixture && ['events', 'event', 'registrations', 'payment'].includes(page) && !canReadPreviewEvents(permissions, scope)) content = <section className="ap-section"><ShieldCheck size={28} /><h2>Event Manager access is required</h2><p>Your account has no Event Manager permission. Choose one of your authorised modules.</p></section>;
  else if (['event', 'payment'].includes(page) && (data.loading || !activeEvent)) content = <EventRecordState loading={data.loading} error={data.error}/>;
  else if (page === 'messaging') content = <MessagingWorkspace session={session} />;
  else if (page === 'help') content = <HelpRequestsWorkspace session={session} />;
  else if (page === 'security') content = <AccountSecurityWorkspace session={session} permissions={permissions} client={supabase} targetEmail={session?.user?.email} />;
  else if (page === 'audit-log') content = <ReviewAuditWorkspace key={scope.id} client={supabase} permissions={permissions} scope={scope} refreshRevision={playerRefresh} />;
  else if (page === 'integrations') content = <ReviewIntegrationsWorkspace canOpen={canOpen} />;
  else if (page === 'settings') content = <ReviewSettingsWorkspace client={supabase} session={session} refreshRevision={playerRefresh} mayOpenLicences={canOpen('licenses')} />;
  else if (page === 'blog') content = <ReviewBlogWorkspace client={supabase} session={session} refreshRevision={playerRefresh} />;
  else if (page === 'players' && session && (permissionsLoading || !permissions)) content = <section className="ap-section ap-live-loading" role="status">Checking Players access…</section>;
  else if (page === 'players' && session && permissions?.role !== 'super_admin' && !permissions?.allowed_tabs?.includes('players')) content = <section className="ap-section ap-live-loading"><ShieldCheck size={28} /><h2>Players access is required</h2><p>This account does not have access to the existing Players admin module.</p></section>;
  else if (page === 'players') content = <PlayersWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${playerRefresh}`} session={session} scopeId={scope.id} permissions={permissions} canManageLicences={canOpen('licenses')} />;
  else if (page === 'team-access') content = scope.id !== 'all' ? <section className="ap-section ax-block"><ShieldCheck size={28} /><h2>Account access management</h2><p>Return to your account workspace to review permissions. Delegated organisation and club access management is still being connected.</p><button className="ap-secondary" onClick={() => { setScopeSelection(null); setContext({ event: null, registration: null }); }}>Return to account workspace</button></section> : <AccessWorkspace key={`${session?.user?.id || 'signed-out'}-${playerRefresh}`} session={session} permissions={permissions} onRefreshPermissions={onRefreshPermissions} />;
  else if (page === 'reports') content = <FinanceOverview key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'payments') content = <PaymentsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'payouts') content = <PayoutsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} initialEventId={queryParams.get('event')} initialOrganisationId={queryParams.get('organisation')} />;
  else if (page === 'clubs') content = <ClubsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}`} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'organisations') {
    const bankingScope = payoutScope(session, permissions, scope.id);
    content = <OrganisationsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh}
      onOpenPayouts={bankingScope && canOpen('payouts') ? organisation => {
        if (bankingScope.organisationId && bankingScope.organisationId !== organisation.id) return;
        go('payouts', { organisationId: organisation.id });
      } : undefined} />;
  }
  else if (page === 'federations') content = <FederationsWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'coaches') content = <CoachesWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${permissions?.role || 'pending'}-${playerRefresh}`} session={session} permissions={permissions} scopeId={scope.id} />;
  else if (page === 'gallery') content = <GalleryWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'email') content = <EmailBroadcastWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'push') content = <PushBroadcastWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh} />;
  else if (page === 'licenses') content = <LicensesWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}`} client={supabase} session={session} permissions={permissions} scopeId={scope.id} refreshRevision={playerRefresh} initialPlayerId={queryParams.get('license_player')} />;
  else if (page === 'tournaments' && (!session || scope.id !== 'all' || !(permissions?.role === 'super_admin' || permissions?.tournamentAssignments?.length))) content = <section className="ap-section"><ShieldCheck size={28}/><h2>Tournament Manager access is required</h2><p>Use your account workspace with an assigned tournament capability. Sidebar permissions alone do not grant tournament access.</p></section>;
  else if (page === 'tournaments') content = <TournamentAdminWorkspace key={`${session.user.id}-${scope.id}`} client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh} canBuildEvents={!localFixture && permissions?.role === 'super_admin'} />;
  else if (page === 'events' && data.loading) content = <section className="ap-section"><RecordLoading label="Loading Event Manager records…" detail="Reading events and registrations available in your current workspace. Larger histories may take longer."/></section>;
  else if (page === 'events' && data.error) content = <section className="ap-section ap-live-loading"><h2>Event Manager could not be loaded</h2><p>{data.error}</p><button className="ap-secondary" onClick={data.reload}>Try again</button></section>;
  else if (page === 'events') content = <EventManagerDashboard key={eventListKey} events={data.events} registrations={data.registrations} go={go} session={session} scopeId={scope.id} canOpenCalendar={canOpen('calendar')} canReadSnapshots={Boolean(session) && !localFixture}
    showBronzeEvents={bronzePreference?.key === eventListKey && bronzePreference.value} onShowBronzeEvents={value => setBronzePreference({ key: eventListKey, value })}
    canBulkSyncRankedin={Boolean(session) && !localFixture && permissions?.role === 'super_admin'} onRefresh={data.reload} />;
  else if (page === 'event' && focusEventId && data.loading) content = <section className="ap-section ap-live-loading"><LoaderCircle className="ap-spin" /><h2>Loading the live event</h2><p>Reading the event, registrations, payments, divisions and activity available to your admin account.</p></section>;
  else if (page === 'event' && focusEventId && data.error) content = <section className="ap-section ap-live-loading"><AlertCircle size={24} /><h2>The live event could not be loaded</h2><p>{data.error}</p><button className="ap-secondary" onClick={data.reload}>Try again</button></section>;
  else if (page === 'event' && queryParams.get('action') === 'host-draw') content = canPrepareHostDraw
    ? <TournamentAdminWorkspace client={supabase} session={session} scopeId={scope.id} refreshRevision={playerRefresh} returnHref={hostDrawReturn}
      hostEvent={{ id: activeEvent.id, organisationId: activeEvent.organisation_id }} />
    : <section className="ap-section"><ShieldCheck size={28} /><h2>Host draw preparation is unavailable</h2>
      <p>Open a 4M event owned by your selected organisation.</p><Link className="ap-secondary" to={hostDrawReturn}>Back to Event Manager</Link></section>;
  else if (page === 'event' && focusEventId && !activeEvent.is_manual) content = <EventParticipantsWorkspace
    key={`${activeEvent.id}-${session?.user?.id}-${scope.id}`} event={activeEvent} go={go} session={session} scopeId={scope.id}
    initialView={queryParams.get('tab') === 'statement' ? 'dashboard' : 'table'} onRefresh={data.reload} />;
  else if (page === 'event' && focusEventId) content = <LiveEventCommandCentre key={`${scope.id}:${focusEventId}`} initialTab={queryParams.get('tab')} initialAction={queryParams.get('action')} initialRegistrationId={queryParams.get('registration')} session={session} scopeId={scope.id} event={activeEvent} registrations={data.registrations} payments={data.payments} divisions={data.divisions} activity={data.activity} draws={data.draws} refunds={data.refunds} go={go} financeRestricted={permissions?.role !== 'super_admin' || (localLivePreview && !session)} canManagePayments={Boolean(session) && !localFixture && permissions?.role === 'super_admin' && scope.id === 'all'}
    canReadEventStatement={Boolean(session) && !localFixture && (permissions?.role === 'super_admin'
      || (scope.id.startsWith('org:') && permissions?.orgs?.some(org => `org:${org.id}` === scope.id && ['owner', 'admin'].includes(org.member_role))))}
    canOperateHostDraw={canPrepareHostDraw}
    canRehearse={permissions?.role === 'super_admin' && scope.id === 'all'}
    onOpenMessages={canOpen('messaging') ? () => go('messaging', { event: activeEvent }) : undefined}
    onOpenHelp={canOpen('help') ? () => go('help', { event: activeEvent }) : undefined}
    onOpenPayouts={canOpen('payouts') && activeEvent.organisation_id ? () => go('payouts', { event: activeEvent }) : undefined}
    onOpenFinance={canOpen('reports') ? () => go('reports') : undefined}
    tournamentWorkspaces={canPrepareHostDraw ? ['draws'] : session && !localFixture ? eventTournamentWorkspaces(permissions, scope.id, activeEvent) : []}
    onOpenTournament={canPrepareHostDraw ? (division, workspace) => go('event', { event: activeEvent, division: division?.id, workspace, hostDraw: true })
      : canOpen('tournaments') ? (division, workspace) => go('tournaments', { event: activeEvent, division: division?.id, workspace }) : undefined}
    onRefresh={data.reload} />;
  else if (page === 'event' && !localFixture) content = <Navigate replace to={`/admin-preview/event?event=${encodeURIComponent(activeEvent.id)}`} />;
  else if (page === 'event') content = <EventCommandCentre event={activeEvent} registrations={data.registrations} go={go} />;
  else if (page === 'calendar' && session && (permissionsLoading || !permissions)) content = <section className="ap-section" role="status">Checking Calendar access…</section>;
  else if (page === 'calendar' && session && !canOpen('calendar')) content = <section className="ap-section"><h2>Calendar access is required</h2><p>Your account does not have Calendar admin permission.</p></section>;
  else if (page === 'calendar') content = <CalendarWorkspace key={`${session?.user?.id || 'signed-out'}-${scope.id}-${playerRefresh}`} session={session} permissions={permissions} scope={scope} scopeId={scope.id} canManageEvents={Boolean(session) && !localFixture && permissions?.role === 'super_admin' && scope.id === 'all'} />;
  else if (page === 'registrations' && data.loading) content = <section className="ap-section"><RecordLoading label="Loading available events…" detail="Reading events for the selected workspace." /></section>;
  else if (page === 'registrations' && data.error) content = <section className="ap-section ap-live-loading" role="alert"><h2>Registrations could not be loaded</h2><p>{data.error}</p><button className="ap-secondary" onClick={data.reload}>Try again</button></section>;
  else if (page === 'registrations') content = <RegistrationsWorkspace client={supabase} session={session} scopeId={scope.id}
    events={data.events} eventId={focusEventId} initialRegistrationId={queryParams.get('registration')} fixtureRows={localFixture ? data.registrations : undefined}
    canReadLedger={permissions?.role === 'super_admin' && scope.id === 'all'} canOpenMessages={canOpen('messaging')} canOpenPlayer={canOpen('player')} go={go} />;
  else if (page === 'payment') content = <PaymentException registration={activeRegistration} event={activeEvent} payments={data.payments} go={go} />;
  else content = <OperationsHome events={data.events} registrations={data.registrations} go={go} userName={userName} canReadEvents={mayLoadEvents} />;

  return <div className="ap-root">
    <a className="ap-skip" href="#admin-preview-content">Skip to content</a>
    <Sidebar activeWorkspace={activeWorkspace} setActiveWorkspace={setActiveWorkspace} page={page} go={go} open={sidebarOpen} setOpen={setSidebarOpen} session={effectiveSession} workspaces={workspaces} currentAdminUrl={currentAdminUrl} />
    <div className="ap-app">{reviewNotice}<Topbar onMenu={() => setSidebarOpen(true)} scopes={scopes.length ? scopes : [displayedScope]} scope={displayedScope} setScope={setScope} onCommand={() => setCommandOpen(true)} onReload={() => {
      onRefreshPermissions?.();
      if (REFRESH_WORKSPACE_PAGES.includes(page)) setPlayerRefresh(n => n + 1);
      else data.reload();
    }} onNotifications={permissions?.role === 'super_admin' ? () => setShellDialog('notifications') : canOpen('help') ? () => go('help') : null}
      onCreate={canCreateEvents ? () => setShellDialog('create') : null} />
      <main id="admin-preview-content" className="ap-main" tabIndex="-1"><ScreenReaderStatus>{RECORD_WORKSPACE_PAGES.includes(page) ? `${page === 'email' ? 'Email broadcast' : page} workspace` : data.loading ? 'Loading records' : `${data.events.length} events and ${data.registrations.length} registrations loaded`}</ScreenReaderStatus>{!RECORD_WORKSPACE_PAGES.includes(page) && data.error && !focusEventId && <div className="ap-data-notice"><AlertCircle size={16} /><span><b>Live data unavailable.</b> Live data could not be loaded: {data.error}</span></div>}<AnimatePresence mode="wait" initial={false}><Motion.div key={`${activeWorkspace}-${page}-${focusEventId || 'all'}`} className="ap-screen" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: reduceMotion ? .1 : .18 }}>{content}</Motion.div></AnimatePresence></main>
    </div>
    {shellDialog === 'notifications' && permissions?.role === 'super_admin' && <ReviewNotifications canOpen={canOpen} go={go} onClose={() => setShellDialog(null)} />}
    {shellDialog === 'create' && canCreateEvents && <CreateEventMenu onClose={() => setShellDialog(null)} onSelect={create => { setShellDialog(null); go('calendar', { create }); }} />}
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} events={data.events} registrations={data.registrations} workspaces={workspaces} go={go} />
  </div>;
}
