import React from 'react';
import { createRoot } from 'react-dom/client';
import EventBuilder from '../../src/components/admin/EventBuilder.jsx';
import { supabase } from '../../src/supabaseClient';
import { Toaster } from 'sonner';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/EventPaymentDialog.css';
const nativeUI = new URLSearchParams(window.location.search).has('ui');
const scenario = new URLSearchParams(window.location.search).get('scenario');
const division = { id: 71, event_id: 61, name: "Men's Open", entry_fee: 600, gender: 'Men', format: 'Knockout', is_active: true, scoring_point: 'golden', license_required: false };
const event = { id: 61, event_name: 'Engine Test Open', slug: 'engine-test-open', start_date: '2026-11-20', end_date: '2026-11-21', start_time: '09:00', end_time: '17:00', venues: ['Test Club'], venue: 'Test Club', city: 'Cape Town', registration_opens_at: '2026-10-01T07:00:00Z', registration_closes_at: '2026-11-18T15:00:00Z', organiser_email: 'qa@example.test', organiser_phone: '', contact_details: 'Test', partner_requirement: 'Required', allow_payments: true, payment_method: 'platform', is_visible: true, entry_fee: 600, sanction_requested: false, federation_sanction_status: 'not_requested' };
event.is_manual = true;
if (scenario?.includes('weekly')) Object.assign(event, { is_weekly: true, series_id: 'test-series', end_date: event.start_date });
if (scenario?.includes('amendment')) Object.assign(event, { pending_changes_status: 'pending', pending_changes: { payload: { event_name: 'Amendment Name' }, divisions: [division], removed_division_ids: [] } });
if (scenario === 'sanction') Object.assign(event, { sanction_requested: true, federation_id: 'federation-1', federation_sanction_status: 'not_requested', sapa_status: 'Gold' });
// Standalone visual mode never touches a backend; the headless runner separately
// intercepts every request to verify the actual query and write payloads.
if (nativeUI) {
  window.mockWrites = [];
  supabase.rpc = async (name, args) => { window.mockWrites.push({ rpc: name, args }); return { data: null, error: scenario === 'code-failure' ? new Error('Synthetic access-code failure') : null }; };
  supabase.auth.getUser = async () => ({ data: { user: null } });
  supabase.from = table => {
    let mutation = null, single = false;
    const query = new Proxy({}, { get: (_, key) => {
      if (key === 'then') return resolve => resolve({ error: null, data: single ? { id: event.id } : table === 'tournament_divisions' ? [division] : table === 'federations' ? [{ id: 'federation-1', name: 'SAPA', slug: 'sapa' }] : [] });
      return (...args) => { if (['insert', 'update', 'delete'].includes(key)) { mutation = { table, method: key, payload: args[0] }; window.mockWrites.push(mutation); } if (key === 'single' || key === 'maybeSingle') single = true; return query; };
    } });
    return query;
  };
  supabase.functions.invoke = async () => ({ error: new Error('External actions disabled in QA') });
}
createRoot(document.getElementById('root')).render(<div className="ap-root"><Toaster/><EventBuilder isOpen theme={nativeUI && !location.search.includes('legacy') ? 'preview' : undefined} onClose={() => { window.closed = true; }} editingEvent={event} beforeSave={context => { window.preflight = context; if (scenario === 'denied') throw new Error('Mock preflight denied'); }} onSaved={result => { window.saved = result; }} renderEditor={nativeUI ? undefined : engine => { window.engine = engine; return <main><h1>Headless EventBuilder QA</h1><p id="readiness">{engine.loading ? 'Loading' : engine.loadError || 'Ready'}</p><button id="draft" onClick={async () => { window.saveResult = await engine.handleSave('draft'); }}>Save draft</button><button id="publish" onClick={async () => { window.saveResult = await engine.handleSave('publish'); }}>Save publish</button></main>; }}/></div>);
