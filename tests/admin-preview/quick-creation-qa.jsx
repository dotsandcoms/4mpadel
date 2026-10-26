import React from 'react';
import { createRoot } from 'react-dom/client';
import QuickEventBuilder from '../../src/components/admin/QuickEventBuilder';
import CreateQuickEventDialog from '../../src/pages/admin-preview/CreateQuickEventDialog';
import { supabase } from '../../src/supabaseClient';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
window.writes = [];
const params = new URLSearchParams(location.search);
supabase.auth.getUser = async () => ({ data: { user: { email: 'qa@example.test' } } });
supabase.from = table => {
  let single = false, write = false;
  const query = new Proxy({}, { get: (_, key) => {
    if (key === 'then') return resolve => resolve({ error: table === 'tournament_divisions' && write && params.has('failure') ? new Error('Mock division failure') : null, data: table === 'admin_sidebar_permissions' ? { role: params.has('denied') ? 'admin' : 'super_admin' } : single ? { id: 777 } : [] });
    return (...args) => {
      if (['insert', 'update', 'delete'].includes(key)) { write = true; window.writes.push({ table, method: key, payload: args[0] }); }
      if (['single', 'maybeSingle'].includes(key)) single = true;
      return query;
    };
  } });
  return query;
};
supabase.rpc = async (name, args) => { window.writes.push({ rpc: name, args }); return { error: null }; };
function Builder(props) {
  return <QuickEventBuilder {...props} renderEditor={params.has('ui') ? undefined : engine => {
    window.engine = engine;
    return <main><button id="save" onClick={async () => { await engine.save(); window.finished = true; }}>Save</button><button id="close" onClick={props.onClose}>Close</button></main>;
  }}/>;
}
createRoot(document.getElementById('root')).render(<div className="ap-root"><CreateQuickEventDialog Builder={Builder} onClose={result => { window.closeResult = result; }}/></div>);
