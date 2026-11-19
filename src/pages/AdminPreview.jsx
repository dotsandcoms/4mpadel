import { createElement, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Banknote, Bell, Building2, CalendarDays, ChevronDown, Command,
  CreditCard, ExternalLink, FileText, GalleryVerticalEnd, KeyRound, LayoutDashboard,
  LogOut, Mail, MapPin, Menu, MessageSquare, Network, Plus, RefreshCw,
  Search, Settings2, ShieldCheck, Trophy, UserPlus, Users, WalletCards, X, Zap,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAdminFeedNotifications } from '../hooks/useAdminFeedNotifications';
import { canOpenReviewPage, isReviewTenant, previewScopes } from './admin-preview/access.js';
import { resolveEventWorkspace } from '../utils/adminCalendarScope.js';
import './AdminPreview.css';

const Dashboard = lazy(() => import('../components/admin/DashboardHome'));
const Federations = lazy(() => import('../components/admin/FederationManager'));
const Organisations = lazy(() => import('../components/admin/OrganisationManager'));
const OrganisationMember = lazy(() => import('./admin-preview/current/OrganisationMember.jsx'));
const Clubs = lazy(() => import('../components/admin/ClubManager'));
const Players = lazy(() => import('../components/admin/PlayerManager'));
const Coaches = lazy(() => import('../components/admin/CoachManager'));
const Gallery = lazy(() => import('../components/admin/GalleryManager'));
const Email = lazy(() => import('../components/admin/EmailBroadcastManager'));
const Blog = lazy(() => import('../components/admin/BlogManager'));
const Settings = lazy(() => import('../components/admin/SettingsManager'));
const Permissions = lazy(() => import('../components/admin/AdminManager'));
const Events = lazy(() => import('./admin-preview/current/CurrentEvents.jsx').then(module => ({ default: module.CurrentEvents })));
const Calendar = lazy(() => import('./admin-preview/current/CurrentEvents.jsx').then(module => ({ default: module.CurrentCalendar })));
const Finance = lazy(() => import('./admin-preview/current/CurrentFinance.jsx').then(module => ({ default: module.CurrentFinance })));
const Licences = lazy(() => import('./admin-preview/current/CurrentFinance.jsx').then(module => ({ default: module.CurrentLicences })));
const Messaging = lazy(() => import('./admin-preview/current/CurrentCommunications.jsx').then(module => ({ default: module.CurrentMessaging })));
const Help = lazy(() => import('./admin-preview/current/CurrentCommunications.jsx').then(module => ({ default: module.CurrentHelp })));
const Security = lazy(() => import('./admin-preview/current/CurrentCommunications.jsx').then(module => ({ default: module.CurrentSecurity })));

const workspaces = [
  { label: 'Operate', caption: 'Run events', icon: Zap, items: [
    ['home', 'Dashboard', LayoutDashboard, 'dashboard'],
    ['events', 'Event Manager', Trophy, 'event-mgmt'],
    ['registrations', 'Registrations', FileText, 'event-mgmt'],
    ['calendar', 'Calendar', CalendarDays, 'calendar'],
    ['messaging', 'Messaging', MessageSquare, 'event-mgmt'],
    ['help', 'Help requests', Bell, 'event-mgmt'],
  ] },
  { label: 'Network', caption: 'People and places', icon: Network, items: [
    ['federations', 'Federations', Network], ['organisations', 'Organisations', Building2],
    ['clubs', 'Clubs', MapPin], ['players', 'Players', Users], ['coaches', 'Coaches', UserPlus],
  ] },
  { label: 'Money', caption: 'Payments and reporting', icon: WalletCards, items: [
    ['payments', 'Payments', CreditCard, 'finance'], ['licenses', 'Licences', ShieldCheck],
    ['payouts', 'Payouts', Banknote, 'finance'], ['reports', 'Finance reports', FileText, 'finance'],
  ] },
  { label: 'Publish', caption: 'Audience and content', icon: GalleryVerticalEnd, items: [
    ['gallery', 'Gallery', GalleryVerticalEnd], ['email', 'Email broadcast', Mail, 'email-broadcast'],
    ['push', 'Push broadcasts', Bell, 'email-broadcast'], ['blog', 'Blog', FileText],
  ] },
  { label: 'System', caption: 'Access and configuration', icon: Settings2, items: [
    ['team-access', 'Access & permissions', ShieldCheck, 'admin-mgmt'], ['settings', 'Settings', Settings2],
    ['security', 'Account security', KeyRound, 'security'],
  ] },
];

const destinations = workspaces.flatMap(workspace => workspace.items);
const oldRoutes = { event: 'events', payment: 'registrations', tournaments: 'events', player: 'players', integrations: 'settings', 'audit-log': 'organisations' };
const controllerRoutes = { dashboard: 'home', 'event-mgmt': 'events', 'tournament-mgmt': 'events', finance: 'reports', 'email-broadcast': 'email', 'admin-mgmt': 'team-access' };

function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="ap-shell-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" className="ap-icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
    {children}
  </dialog>;
}

function Notifications({ onClose, go, canOpen }) {
  const { notifications, loading } = useAdminFeedNotifications();
  const routes = { payment: 'payments', player: 'players', event: 'calendar' };
  return <Dialog title="Notifications" onClose={onClose}>
    {loading ? <p role="status">Loading notifications…</p> : !notifications.length ? <p>No recent notifications.</p> : <ul className="ap-shell-list">
      {notifications.map(item => <li key={item.id}>
        <div><b>{item.title}</b><small>{item.subtitle} · {item.timeAgo}</small></div>
        {canOpen(routes[item.type]) && <button className="ap-secondary" onClick={() => { go(routes[item.type]); onClose(); }}>Open</button>}
      </li>)}
    </ul>}
  </Dialog>;
}

function WorkspaceSearch({ items, onClose, go }) {
  const [query, setQuery] = useState('');
  const results = items.filter(([, label]) => label.toLowerCase().includes(query.trim().toLowerCase()));
  return <Dialog title="Find an Admin workspace" onClose={onClose}>
    <label className="ap-shell-search"><Search size={18} /><span className="ap-visually-hidden">Workspace name</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search workspaces…" /></label>
    {results.length ? <ul className="ap-shell-list">{results.map(([id, label, Icon]) => <li key={id}><button className="ap-shell-result" onClick={() => { go(id); onClose(); }}>{createElement(Icon, { size: 17, 'aria-hidden': true })}{label}<ArrowRight size={15} /></button></li>)}</ul> : <p role="status">No matching workspaces.</p>}
  </Dialog>;
}

function OrganisationPanel({ permissions, scopeId }) {
  const org = permissions.orgs?.find(row => scopeId === `org:${row.id}`);
  const scoped = useMemo(() => {
    if (!org) return permissions;
    return { ...permissions, org, orgs: [org], orgRole: org.member_role };
  }, [permissions, org]);
  if (org?.member_role === 'staff' && permissions.role !== 'super_admin') return <OrganisationMember organisation={org} />;
  return <Organisations permissions={scoped} initialView={org || new URLSearchParams(window.location.search).get('view') === 'host' ? 'host' : 'platform'} restrictToOrganisation={Boolean(org)} />;
}

function CurrentPanel({ page, props, canOpen, go }) {
  switch (page) {
    case 'home': return <Dashboard onTabChange={tab => go(controllerRoutes[tab] || tab)} />;
    case 'events':
    case 'registrations': return <Events {...props} />;
    case 'calendar': return <Calendar {...props} />;
    case 'messaging': return <Messaging {...props} />;
    case 'help': return <Help {...props} />;
    case 'security': return <Security {...props} />;
    case 'payments':
    case 'payouts':
    case 'reports': return <Finance {...props} />;
    case 'licenses': return <Licences {...props} />;
    case 'federations': return <Federations permissions={props.permissions} restrictToMembership={isReviewTenant(props.permissions) && props.permissions.role !== 'super_admin'} />;
    case 'organisations': return <OrganisationPanel permissions={props.permissions} scopeId={props.scopeId} />;
    case 'clubs': return <Clubs permissions={props.permissions} restrictToMembership={isReviewTenant(props.permissions) && props.permissions.role !== 'super_admin'} />;
    case 'players': return <Players canManageLicenses={canOpen('licenses')} licenseHrefForPlayer={playerId => `/admin-preview/licenses?license_player=${encodeURIComponent(playerId)}`} />;
    case 'coaches': return <Coaches />;
    case 'gallery': return <Gallery permissions={props.permissions} />;
    case 'email':
    case 'push': return <Email initialChannel={page === 'push' ? 'push' : 'email'} />;
    case 'blog': return <Blog />;
    case 'settings': return <Settings licenceHref="/admin-preview/licenses" />;
    case 'team-access': return <Permissions />;
    default: return null;
  }
}

export default function AdminPreview({ session, permissions, onRefreshPermissions, reviewNotice, currentAdminUrl }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [scopeId, setScopeId] = useState('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const targetEmail = session.user.email;
  const requested = pathname.split('/').filter(Boolean)[1];
  const page = oldRoutes[requested] || requested;
  const canOpen = id => canOpenReviewPage(permissions, id);
  const scopes = previewScopes(permissions, page);
  const scope = scopes.find(item => item.id === scopeId) || scopes[0];
  const calendarScopes = previewScopes(permissions, 'calendar');
  const calendarScope = calendarScopes.find(item => item.id === scopeId) || calendarScopes[0];
  const calendarAccess = canOpen('calendar') && calendarScope ? resolveEventWorkspace(permissions, calendarScope.id, 'calendar') : null;
  const canCreateEvent = Boolean(calendarAccess?.allowPlatformActions || (calendarAccess?.scopeId?.startsWith('org:') && !calendarAccess.allowedEvents?.length));
  const go = (id, query = '') => {
    if (!canOpen(id)) return;
    navigate(`/admin-preview/${id}${query}`);
    setSidebarOpen(false);
  };

  useEffect(() => {
    const openSearch = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setDialog('search');
      }
    };
    document.addEventListener('keydown', openSearch);
    return () => document.removeEventListener('keydown', openSearch);
  }, []);

  async function logOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch {
      setLogoutError('Could not log out. Please try again.');
      setLoggingOut(false);
    }
  }

  const available = destinations.filter(([id]) => canOpen(id));
  if (!requested && available.length) return <Navigate replace to={`/admin-preview/${canOpen('events') ? 'events' : available[0][0]}`} />;
  const active = scope && available.find(([id]) => id === page);
  const props = { session, permissions, targetEmail, scopeId: scope?.id, page, refreshRevision: revision, onLegacyTab: tab => go(controllerRoutes[tab] || tab) };
  const accountName = targetEmail.split('@')[0];

  return <div className="ap-root">
    <a className="ap-skip" href="#admin-preview-content">Skip to content</a>
    {sidebarOpen && <button type="button" className="ap-sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`ap-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Admin workspaces">
      <div className="ap-brand"><strong>4M</strong><span>PADEL</span><small>Admin</small></div>
      <nav className="ap-sidebar-nav" aria-label="Workspaces">{workspaces.map(({ label, caption, icon: Icon, items }) => {
        const visible = items.filter(([id]) => canOpen(id));
        if (!visible.length) return null;
        return <section key={label} className={`ap-nav-group ${visible.some(([id]) => id === page) ? 'is-active' : ''}`}>
          <div className="ap-workspace-heading">{createElement(Icon, { size: 16, 'aria-hidden': true })}<span><b>{label}</b><small>{caption}</small></span></div>
          <div className="ap-nav-destinations">{visible.map(([id, name, ItemIcon]) => <button key={id} className={`ap-nav-destination ${page === id ? 'is-active' : ''}`} aria-label={name} title={name} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>{createElement(ItemIcon, { size: 15, 'aria-hidden': true })}<span>{name}</span></button>)}</div>
        </section>;
      })}</nav>
      <div className="ap-sidebar-account"><div className="ap-avatar">{accountName.slice(0, 1).toUpperCase()}</div><span><b title={targetEmail}>{accountName}</b><small>Signed in</small></span><a href={currentAdminUrl} aria-label="Open current Admin"><ExternalLink size={16} /></a></div>
      <button type="button" className="ap-logout" onClick={logOut} disabled={loggingOut}><LogOut size={16} />{loggingOut ? 'Logging out…' : 'Log out'}</button>
      {logoutError && <p className="ap-logout-error" role="alert">{logoutError}</p>}
    </aside>
    <div className="ap-app">
      {reviewNotice}
      <header className="ap-topbar">
        <button type="button" className="ap-icon-button ap-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-expanded={sidebarOpen}><Menu size={20} /></button>
        {scopes.length > 1 ? <label className="ap-scope ap-shell-scope"><Building2 size={16} /><span className="ap-visually-hidden">Working in</span><select value={scope.id} onChange={event => setScopeId(event.target.value)}>{scopes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></label> : <div className="ap-shell-account-scope"><Building2 size={16} />{scope?.label || 'My authorised access'}</div>}
        <button type="button" className="ap-search-button" aria-label="Find a workspace" onClick={() => setDialog('search')}><Search size={18} /><span>Find a workspace</span><kbd><Command size={11} />K</kbd></button>
        <div className="ap-top-actions">
          <button type="button" className="ap-icon-button" onClick={() => { onRefreshPermissions?.(); setRevision(count => count + 1); }} aria-label="Reload workspace"><RefreshCw size={17} /></button>
          {permissions?.role === 'super_admin' && <button type="button" className="ap-icon-button" onClick={() => setDialog('notifications')} aria-label="Open notifications"><Bell size={18} /></button>}
          {canCreateEvent && <button type="button" className="ap-primary ap-create" aria-label="Create an event" onClick={() => setDialog('create')}><Plus size={18} /><span>Create</span></button>}
        </div>
      </header>
      <main id="admin-preview-content" className="ap-main" tabIndex="-1">
        {active ? <><div className="ap-page-heading"><div><h1>{active[1]}</h1></div></div>
          <section className="ap-current-panel" aria-label={`${active[1]} workspace`}>
            <Suspense fallback={<p role="status">Loading {active[1].toLowerCase()}…</p>}><CurrentPanel key={`${session.user.id}:${page}:${props.scopeId}:${revision}`} page={page} props={props} canOpen={canOpen} go={go} /></Suspense>
          </section></> : <section className="ap-section ap-shell-unavailable"><h1>Workspace unavailable</h1><p>Choose an available workspace for this account.</p>{available[0] && <button className="ap-secondary" onClick={() => go(available[0][0])}>Open {available[0][1]}</button>}</section>}
      </main>
    </div>
    {dialog === 'search' && <WorkspaceSearch items={available} onClose={() => setDialog(null)} go={go} />}
    {dialog === 'notifications' && <Notifications onClose={() => setDialog(null)} go={go} canOpen={canOpen} />}
    {dialog === 'create' && canCreateEvent && <Dialog title="Create an event" onClose={() => setDialog(null)}><ul className="ap-shell-list">
      {['full', 'quick'].map(kind => <li key={kind}><button type="button" className="ap-shell-result" onClick={() => { setDialog(null); go('calendar', `?create=${kind}`); }}><Plus size={17} />{kind === 'full' ? 'Full event' : 'Quick event'}<ArrowRight size={15} /></button></li>)}
    </ul></Dialog>}
  </div>;
}
