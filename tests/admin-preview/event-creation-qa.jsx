import React from 'react';
import { createRoot } from 'react-dom/client';
import CreateEventDialog from '../../src/pages/admin-preview/CreateEventDialog';
import EventBuilder from '../../src/components/admin/EventBuilder';
import { supabase } from '../../src/supabaseClient';
window.writes = [];
const denied = location.search.includes('denied');
supabase.auth.getUser = async () => ({ data: { user: { email: 'qa@example.test' } } });
supabase.from = table => {
  let single = false, insert = false;
  const query = new Proxy({}, { get: (_, key) => {
    if (key === 'then') return resolve => resolve({ error: null, data: table === 'admin_sidebar_permissions' ? { role: denied ? 'admin' : 'super_admin' } : single ? insert ? { id: 777 } : null : [] });
    return (...args) => {
      if (['insert', 'update', 'delete'].includes(key)) { window.writes.push({ table, method: key, payload: args[0] }); insert = key === 'insert'; }
      if (['single', 'maybeSingle'].includes(key)) single = true;
      return query;
    };
  } });
  return query;
};
function HeadlessBuilder(props) {
  return <EventBuilder {...props} renderEditor={engine => {
    window.engine = engine;
    return <main><button id="draft" onClick={async () => { window.result = await engine.handleSave('draft'); }}>Save draft</button><button id="close" onClick={props.onClose}>Close</button></main>;
  }}/>;
}
createRoot(document.getElementById('root')).render(<CreateEventDialog Builder={HeadlessBuilder} onClose={result => { window.closeResult = result; }}/>);
