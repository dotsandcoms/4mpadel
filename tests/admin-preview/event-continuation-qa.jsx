import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EventBuilder from '../../src/components/admin/EventBuilder.jsx';
import { supabase } from '../../src/supabaseClient';
import { eventContinuation } from '../../src/pages/admin-preview/eventContinuation.js';

// Every database/RPC/storage/edge boundary is mocked. No real operations.
window.fetch = async () => { throw new Error('Network disabled in synthetic continuation QA'); };
const writes = [], originalToken = {}, state = { token: originalToken };
const event = { id: 61, is_manual: true, event_name: 'Synthetic continuation', slug: 'synthetic', start_date: '2026-11-20', end_date: '2026-11-21', venues: ['Test Club'], city: 'Cape Town' };
const division = { id: 71, event_id: 61, name: 'Open', entry_fee: 500, is_active: true };
supabase.auth.getUser = async () => ({ data: { user: { id: 'synthetic-actor', email: 'qa@example.invalid' } } });
supabase.from = table => {
  let write, single = false;
  const query = new Proxy({}, { get: (_, key) => {
    if (key === 'then') return resolve => {
      if (write) { writes.push(write); state.token = {}; }
      resolve({ error: null, data: single ? { id: 61 } : table === 'tournament_divisions' ? [division] : [] });
    };
    return (...args) => { if (['insert', 'update', 'delete'].includes(key)) write = { table, operation: key, payload: args[0] }; if (['single', 'maybeSingle'].includes(key)) single = true; return query; };
  } }); return query;
};
supabase.rpc = async (name, args) => {
  if (name === 'tm_list_events') return { data: [], error: null };
  writes.push({ rpc: name, args }); return { data: null, error: null };
};
supabase.functions.invoke = async () => { throw new Error('Edge calls disabled'); };
supabase.storage.from = () => ({ upload: async () => { throw new Error('Uploads disabled'); } });
function Fixture() {
  const [result, setResult] = useState(null);
  return <EventBuilder isOpen theme="preview" editingEvent={event}
    beforeSave={() => ({ verifyContinuing: eventContinuation({ client: supabase, actorId: 'synthetic-actor', token: originalToken, getCurrent: () => state.token }) })}
    renderEditor={engine => <main><h1>Event continuation synthetic QA</h1><p>{engine.ready ? 'Ready' : 'Loading'}</p>
      <button disabled={!engine.ready} onClick={async () => { const outcome = await engine.handleSave('draft'); setResult({ outcome, writes }); }}>Run interrupted save</button>
      <pre>{JSON.stringify(result, null, 2)}</pre></main>}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
