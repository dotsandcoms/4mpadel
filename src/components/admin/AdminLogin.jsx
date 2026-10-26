import { useState } from 'react';
import { ArrowRight, CalendarDays, Eye, EyeOff, LockKeyhole, ShieldCheck, Trophy, Users } from 'lucide-react';
import './AdminLogin.css';

export default function AdminLogin({ email, password, onEmail, onPassword, onSubmit, busy, error, preview = false }) {
  const [showPassword, setShowPassword] = useState(false);
  return <main className="admin-login">
    <section className="admin-login__brand" aria-label="4M Padel Admin">
      <a className="admin-login__logo" href="/" aria-label="4M Padel home"><strong>4M</strong><span>PADEL</span><small>Admin</small></a>
      <div className="admin-login__story"><p className="admin-login__eyebrow">Operations workspace</p><h1>One place to run every part of 4M Padel.</h1><p>Players, events, registrations and finance stay connected—so the team can act with the full picture.</p><ul><li><Users size={16} />Player and licence records</li><li><CalendarDays size={16} />Calendar and event operations</li><li><Trophy size={16} />Competition and payment oversight</li></ul></div>
      <p className="admin-login__brand-foot"><ShieldCheck size={15} />Access follows your existing admin permissions.</p>
    </section>
    <section className="admin-login__form-side">
      <form className="admin-login__form" onSubmit={onSubmit} aria-busy={busy} aria-describedby={error ? 'admin-login-error' : undefined}>
        <div className="admin-login__lock"><LockKeyhole size={21} aria-hidden="true" /></div>
        <p className="admin-login__eyebrow">4M Padel {preview ? 'Admin preview' : 'Admin'}</p>
        <h2>{preview ? 'Sign in to the preview' : 'Sign in to your workspace'}</h2>
        <p className="admin-login__intro">Use your existing admin account. Your role decides which workspaces and records you can access.</p>
        <label htmlFor="admin-email">Email address</label>
        <input id="admin-email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck="false" value={email} onChange={onEmail} required placeholder="name@4mpadel.co.za" aria-invalid={error ? 'true' : undefined} />
        <label htmlFor="admin-password">Password</label>
        <div className="admin-login__password"><input id="admin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={onPassword} required aria-invalid={error ? 'true' : undefined} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        {error && <div className="admin-login__error" id="admin-login-error" role="alert"><strong>Sign-in failed.</strong><span>{error}</span></div>}
        <button className="admin-login__submit" type="submit" disabled={busy}>{busy ? <span className="admin-login__spinner" aria-hidden="true" /> : <ArrowRight size={18} />}{busy ? 'Checking your account…' : preview ? 'Open admin preview' : 'Sign in to Admin'}</button>
        <p className="admin-login__help">Can’t sign in? Contact your 4M Padel administrator to check your account or reset your access.</p>
        <a className="admin-login__back" href="/">← Return to the live site</a>
      </form>
    </section>
  </main>;
}
