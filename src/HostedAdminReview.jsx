import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import AdminLogin from './components/admin/AdminLogin.jsx';
import AdminPreview from './pages/AdminPreview.jsx';
import { FOURM_PUBLIC_ORIGIN } from './constants/site.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { verifyHostedReviewAccess } from './pages/admin-preview/hostedReviewAccess.js';
import './HostedAdminReview.css';

const CURRENT_ADMIN = `${FOURM_PUBLIC_ORIGIN}/admin`;

function ReviewNotice() {
  return <aside className="hosted-review-notice" aria-label="Live database review">
    <p><strong>4M Admin review · Live database</strong><span>Actions in this review use the same records as the current Admin.</span></p>
    <a href={CURRENT_ADMIN} target="_blank" rel="noopener noreferrer">Open current admin ↗</a>
  </aside>;
}

function StartReview() {
  const location = useLocation();
  return <Navigate replace to={{ pathname: '/admin-preview', search: location.search, hash: location.hash }} />;
}

export default function HostedAdminReview() {
  const [candidate, setCandidate] = useState(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [access, setAccess] = useState({ state: 'checking' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    let mounted = true;
    let observed = false;
    const receive = session => {
      if (!mounted) return;
      // Refresh the same actor's authority in the background without throwing
      // away open editors. Identity changes and failed checks still unmount.
      setAccess(previous => session?.user && previous.state === 'ready' && previous.user.id === session.user.id && previous.user.email === session.user.email
        ? previous : { state: session?.user ? 'checking' : 'signed-out' });
      setCandidate(session?.user ? session : null);
      setAuthRevision(value => value + 1);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      observed = true;
      receive(session);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || observed) return;
      if (error) setLoginError('Your session could not be read. Please sign in again.');
      receive(error ? null : data?.session);
    }).catch(() => {
      if (mounted && !observed) {
        setLoginError('The sign-in service could not be reached. Please try again.');
        receive(null);
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!candidate) return;
    const controller = new AbortController();
    verifyHostedReviewAccess(supabase, candidate.user, controller.signal).then(verified => {
      if (!controller.signal.aborted) setAccess(previous => {
        const sameActor = previous.state === 'ready' && previous.user.id === verified.user.id && previous.user.email === verified.user.email;
        if (sameActor && JSON.stringify(previous.permissions) === JSON.stringify(verified.permissions)) return previous;
        return { state: 'ready', ...verified, version: (previous.version || 0) + 1 };
      });
    }).catch(error => {
      if (!controller.signal.aborted) setAccess({ state: 'denied', message: error.message });
    });
    return () => controller.abort();
  }, [candidate, authRevision]);

  useEffect(() => {
    if (!candidate) return;
    const refresh = () => setAuthRevision(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [candidate]);

  const signIn = async event => {
    event.preventDefault();
    if (busy) return;
    if (!isSupabaseConfigured()) { setLoginError('The live database connection is not configured. Contact your administrator.'); return; }
    setBusy(true); setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setLoginError(error.message);
      else setPassword('');
    } catch { setLoginError('The sign-in service could not be reached. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Other-domain sessions, including the live admin, are left alone.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) setAccess(previous => ({ ...previous, message: 'Could not sign out. Please try again.' }));
    } catch { setAccess(previous => ({ ...previous, message: 'Could not sign out. Please try again.' })); }
    finally { setBusy(false); }
  };

  if (access.state === 'signed-out') return <><ReviewNotice /><AdminLogin preview siteUrl={FOURM_PUBLIC_ORIGIN} email={email} password={password} onEmail={event => setEmail(event.target.value)} onPassword={event => setPassword(event.target.value)} onSubmit={signIn} busy={busy} error={loginError} /></>;
  if (access.state === 'denied') return <><ReviewNotice /><main className="ap-denied hosted-review-gate"><h1>Review access is required</h1><p role="alert">{access.message}</p><button className="ap-secondary" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out and use another account'}</button><a href={CURRENT_ADMIN}>Return to the current admin</a></main></>;
  if (access.state !== 'ready' || access.user?.id !== candidate?.user?.id || access.user?.email !== candidate?.user?.email) return <><ReviewNotice /><main className="ap-loading"><p role="status">Checking your live admin access…</p></main></>;
  return <><Routes>
    <Route path="/admin-preview/*" element={<AdminPreview key={`${access.user.id}:${access.user.email}:${access.version}`} session={candidate} permissions={access.permissions} onRefreshPermissions={() => setAuthRevision(value => value + 1)} reviewNotice={<ReviewNotice />} currentAdminUrl={CURRENT_ADMIN} />} />
    <Route path="*" element={<StartReview />} />
  </Routes><Toaster position="top-right" /></>;
}
