import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import CreateClubDialog from '../../src/pages/admin-preview/CreateClubDialog';
import '../../src/components/clubs/ClubCreateWizardPreview.css';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
const params = new URLSearchParams(location.search);
const state = window.clubCreationQA = { writes: [], uploads: [], guards: [], emails: [], role: params.has('denied') ? 'admin' : 'super_admin' };
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#d5eaa9"/></svg>');
const client = {
  rpc: async name => { state.guards.push(name); return {data: name === 'account_is_active' || state.role === 'super_admin'}; },
  from(table) {
    let payload, single = false;
    const query = new Proxy({}, { get(_, key) {
      if (key === 'then') return async resolve => {
        if (table === 'admin_sidebar_permissions') { state.guards.push('role-check'); return resolve({ data: { role: state.role } }); }
        if (payload) {
          state.writes.push({ table, payload });
          await new Promise(resolve => setTimeout(resolve, 900));
          return resolve(params.has('failure') ? { error: new Error('Synthetic club insert failed') } : { data: { id: 'created-qa', ...payload[0] }, error: null });
        }
        return resolve({ data: single ? null : [], error: table === 'clubs' && single && params.has('lookupFailure') ? new Error('Synthetic slug lookup failed') : null });
      };
      return (...args) => { if (key === 'insert') payload = args[0]; if (['single', 'maybeSingle'].includes(key)) single = true; return query; };
    } }); return query;
  },
  auth: { getUser: async () => ({ data: { user: { id: 'qa', email: 'qa@example.test' } } }), getSession: async () => ({ data: { session: null } }) },
  functions: { invoke: async (...args) => { state.emails.push(args); throw new Error('No emails allowed'); } },
  storage: { from(bucket) { return { upload: async (path, file) => { state.uploads.push({ bucket, path, type: file.type }); return { error: params.has('uploadFailure') ? new Error('Synthetic upload failed') : null }; }, getPublicUrl: () => ({ data: { publicUrl: image } }) }; } },
};
window.google = { maps: { places: { Autocomplete: class { constructor() { this.place = {}; } addListener(_, handler) { state.choosePlace = place => { this.place = place; handler(); }; return {}; } getPlace() { return this.place; } } }, event: { removeListener() {}, clearInstanceListeners() {} } } };
function App() {
  const [open, setOpen] = React.useState(true);
  return <div className="ap-root" style={{ display: 'block' }}><Toaster/>{open && <CreateClubDialog client={client} scopeId="all" session={{ user: { id: 'qa' } }} onComplete={record => { state.completed = record; setOpen(false); }} onClose={() => { state.cancelled = true; setOpen(false); }} onOpenExisting={id => { state.opened = id; }}/>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
