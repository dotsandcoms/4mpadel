import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../constants/fees';
import { eventEntryQuote, fetchCommerceConfig, formatQuoteCaption, licenseQuote, normalizeCommerce } from '../../utils/commerce';
import RecordLoading from './RecordLoading';
import { verifyHostedReviewAccess } from './hostedReviewAccess';
import { canOpenReviewPage } from './access';
import './ReviewSettingsWorkspace.css';

const socialFields = {
  instagram: 'Instagram URL',
  youtube: 'YouTube channel or stream URL',
  facebook: 'Facebook page',
  whatsapp: 'WhatsApp community link',
};
const feeFields = { license_fee_percent: 'Licence fee (%)', event_fee_percent: 'Event booking fee (%)' };

async function requireSettingsAccess(client, session, signal) {
  const { permissions } = await verifyHostedReviewAccess(client, session.user, signal);
  if (!canOpenReviewPage(permissions, 'settings')) throw new Error('Current Settings access is required.');
  return permissions;
}

async function readSiteLinks(client) {
  const keys = Object.keys(socialFields);
  const { data, error } = await client.from('settings').select('key,value').in('key', keys);
  if (error) throw error;
  const links = new Map((data || []).map(row => [row.key, row.value]));
  return Object.fromEntries(keys.map(key => [key, String(links.get(key) ?? '')]));
}

function settingsError(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

export default function ReviewSettingsWorkspace({ client, session, refreshRevision, mayOpenLicences }) {
  const [state, setState] = useState({ loading: true, error: '' });
  const [links, setLinks] = useState({});
  const [feeDraft, setFeeDraft] = useState(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(null);
  const userId = session.user.id;
  const email = session.user.email;

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    setState({ loading: true, error: '' });
    setBusy('');
    setNotice('');
    setError('');
    const load = async () => {
      await requireSettingsAccess(client, { user: { id: userId, email } }, controller.signal);
      const [siteLinks, commerce] = await Promise.all([readSiteLinks(client), fetchCommerceConfig(client)]);
      if (controller.signal.aborted) return;
      setLinks(siteLinks);
      setFeeDraft(commerce);
      setState({ loading: false, error: '', siteLinks, commerce });
    };
    load().catch(issue => {
      if (!controller.signal.aborted) setState({ loading: false, error: settingsError(issue, 'Settings could not be loaded.') });
    });
    return () => controller.abort();
  }, [client, userId, email, refreshRevision, revision]);

  const writeLock = useRef(false);
  const save = async (kind, operation) => {
    if (writeLock.current || !pending.current || pending.current.signal.aborted) return;
    const { signal } = pending.current;
    writeLock.current = true;
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await requireSettingsAccess(client, session, signal);
      const message = await operation(signal);
      if (!signal.aborted) setNotice(message);
    } catch (issue) {
      if (!signal.aborted) setError(settingsError(issue, 'Settings could not be saved. Try again.'));
    } finally {
      writeLock.current = false;
      if (!signal.aborted) setBusy('');
    }
  };

  const saveLinks = event => {
    event.preventDefault();
    void save('links', async signal => {
      const updated = Object.entries(links).filter(([key, value]) => value !== state.siteLinks[key]);
      const values = updated.map(([key, value]) => {
        const url = value.trim();
        if (url && !['https:', 'http:'].includes(new URL(url).protocol)) throw new Error('Enter a valid web URL.');
        return { key, value: url, updated_at: new Date().toISOString() };
      });
      const { error: writeError } = await client.from('settings').upsert(values);
      if (writeError) throw writeError;
      const saved = { ...state.siteLinks, ...Object.fromEntries(values.map(row => [row.key, row.value])) };
      if (!signal.aborted) {
        setLinks(saved);
        setState(current => ({ ...current, siteLinks: saved }));
      }
      return 'Site links saved.';
    });
  };

  const saveFees = event => {
    event.preventDefault();
    void save('fees', async signal => {
      if (!feeDraft.fee_label.trim()) throw new Error('Enter a fee name.');
      const { fee_label, license_fee_percent, event_fee_percent } = normalizeCommerce(feeDraft);
      let query = client.from('commerce_config').update({
        fee_label, license_fee_percent, event_fee_percent, updated_by: userId,
      }).eq('id', 'default');
      if (state.commerce.updated_at) query = query.eq('updated_at', state.commerce.updated_at);
      const { data, error: writeError } = await query.select('id').maybeSingle();
      if (writeError || !data) throw new Error('Fees could not be saved. Reload before trying again.');
      const commerce = await fetchCommerceConfig(client);
      if (!signal.aborted) {
        setFeeDraft(commerce);
        setState(current => ({ ...current, commerce }));
      }
      return 'Checkout fees saved.';
    });
  };

  const changeFee = (key, value) => setFeeDraft(draft => ({ ...draft, [key]: value }));
  const changedLinks = Object.keys(socialFields).some(key => links[key] !== state.siteLinks?.[key]);
  const changedFees = state.commerce && feeDraft && ['fee_label', ...Object.keys(feeFields)].some(key => String(feeDraft[key]) !== String(state.commerce[key]));
  const describeLicence = type => {
    const quote = licenseQuote(type, feeDraft);
    return quote.enabled ? formatQuoteCaption(quote, formatCurrency) : 'Sales closed';
  };

  return <>
    <header className="ap-page-heading">
      <div><p className="ap-kicker">System</p><h1>Settings</h1><p className="ap-lede">Checkout fees and public website links.</p></div>
      <button type="button" className="ap-secondary" disabled={state.loading || Boolean(busy)} onClick={() => setRevision(value => value + 1)}>Reload settings</button>
    </header>
    {state.loading && <RecordLoading label="Loading Settings…" />}
    {(state.error || error) && <p role="alert" className="ap-data-notice">{state.error || error}</p>}
    {notice && <p role="status" className="ap-data-notice">{notice}</p>}
    {!state.loading && !state.error && <div className="ap-settings-workspace">
      <section className="ap-section">
        <header className="ap-section-heading"><h2>Checkout fees</h2>{mayOpenLicences && <Link className="ap-secondary" to="/admin-preview/licenses">Open Licences</Link>}</header>
        <form className="ap-settings-content" onSubmit={saveFees}>
          <fieldset disabled={Boolean(busy)} className="ap-settings-fields">
            <label>Fee name<input required maxLength={40} value={feeDraft.fee_label} onChange={event => changeFee('fee_label', event.target.value)} /></label>
            {Object.entries(feeFields).map(([key, label]) => <label key={key}>{label}
              <input required type="number" min={0} max={100} step={0.1} value={feeDraft[key]} onChange={event => changeFee(key, event.target.value)} />
            </label>)}
          </fieldset>
          <dl className="ap-settings-quotes" aria-label="Checkout preview">
            <div><dt>Full licence</dt><dd>{describeLicence('full')}</dd></div>
            <div><dt>Temporary licence</dt><dd>{describeLicence('temporary')}</dd></div>
            <div><dt>R600 event entry</dt><dd>{formatQuoteCaption(eventEntryQuote(600, feeDraft), formatCurrency)}</dd></div>
          </dl>
          <footer><button className="ap-primary" disabled={!changedFees || Boolean(busy)}>{busy === 'fees' ? 'Saving fees…' : 'Save fee settings'}</button></footer>
        </form>
      </section>
      <section className="ap-section">
        <header className="ap-section-heading"><h2>Social links</h2></header>
        <form className="ap-settings-content" onSubmit={saveLinks}>
          <fieldset className="ap-settings-fields ap-settings-social" disabled={Boolean(busy)}>
            {Object.entries(socialFields).map(([key, label]) => <label key={key}>{label}
              <input type="url" value={links[key]} onChange={event => setLinks(current => ({ ...current, [key]: event.target.value }))} />
            </label>)}
          </fieldset>
          <footer><button className="ap-primary" disabled={!changedLinks || Boolean(busy)}>{busy === 'links' ? 'Saving links…' : 'Save site links'}</button></footer>
        </form>
      </section>
      <section className="ap-section">
        <header className="ap-section-heading"><h2>Site configuration</h2></header>
        <dl className="ap-settings-content ap-settings-quotes">
          <div><dt>Site name</dt><dd>4M Padel</dd></div>
          <div><dt>Admin email</dt><dd>admin@4mpadel.co.za</dd></div>
        </dl>
      </section>
    </div>}
  </>;
}
