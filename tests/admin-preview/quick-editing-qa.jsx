import React from 'react';
import { createRoot } from 'react-dom/client';
import QuickEventBuilder from '../../src/components/admin/QuickEventBuilder';
import QuickEventDetailsDialog from '../../src/pages/admin-preview/QuickEventDetailsDialog';
import { supabase } from '../../src/supabaseClient';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
const params = new URLSearchParams(location.search);
const event = { id: 777, event_name: 'QA Existing Quick', organiser_name: 'QA Club', slug: 'existing-quick', is_manual: true, is_quick_event: true, is_weekly: false, is_visible: false, sanction_status: 'pending', registration_access: 'code', start_date: '2026-11-01', end_date: '2026-11-01', start_time: '09:00', end_time: '17:00', registration_opens_at: '2026-10-01T07:00:00Z', registration_closes_at: '2026-10-31T15:00:00Z', venue: 'QA Venue', payment_method: 'platform', entry_fee: 100, max_players: 16, partner_requirement: 'Required' };
const division = { id: 888, event_id: 777, name: 'Existing Division', format: 'Round Robin', entry_fee: 345, entry_limit: 16 };
if (params.has('enable-empty')) event.registration_access = 'public';
window.quickEditWrites = []; window.quickEditStale = false;
supabase.auth.getUser = async () => ({ data: { user: { email: 'qa@example.test' } } });
supabase.from = table => {
  let one = false, payload, method; const filters = [];
  const query = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => {
      if (method) { window.quickEditWrites.push({ table, method, payload, filters }); return resolve({ error: params.has('failure') && table === 'tournament_divisions' ? new Error('Synthetic division failure') : null, data: null }); }
      if (table === 'admin_sidebar_permissions') return resolve({ data: { role: params.has('denied') ? 'admin' : 'super_admin' } });
      const rows = table === 'calendar' ? [{ ...event, ...(window.quickEditStale ? { event_name: 'Changed elsewhere' } : {}) }] : table === 'tournament_divisions' && !params.has('missing') ? [division] : [];
      const filtered = rows.filter(row => filters.every(([field, value]) => row[field] === value));
      return resolve({ data: one ? filtered[0] || null : filtered, error: null });
    };
    return (...args) => { if (['single', 'maybeSingle'].includes(key)) one = true; if (key === 'eq') filters.push(args); if (['update','insert','delete'].includes(key)) { method = key; payload = args[0]; } return query; };
  } }); return query;
};
supabase.rpc = async (rpc, args) => { window.quickEditWrites.push({ rpc, args }); return { error: null }; };
function Builder(props) { return params.has('ui') ? <QuickEventBuilder {...props}/> : <QuickEventBuilder {...props} renderEditor={engine => { window.quickEditEngine = engine; return <main><button id="save" onClick={async () => { await engine.save(); window.quickEditFinished = true; }}>Save</button><button id="close" onClick={props.onClose}>Close</button></main>; }}/>; }
createRoot(document.getElementById('root')).render(<div className="ap-root"><QuickEventDetailsDialog event={event} Builder={Builder} onClose={result => { window.quickEditClose = result; }}/></div>);
