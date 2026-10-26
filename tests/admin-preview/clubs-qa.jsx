import React from 'react';
import { createRoot } from 'react-dom/client';
import ClubsWorkspace from '../../src/pages/admin-preview/ClubsWorkspace.jsx';
import '../../src/pages/AdminPreview.css';
const params = new URLSearchParams(location.search);
const rows = Array.from({ length: 12 }, (_, id) => ({ id: String(id), name: `Synthetic Club ${String(id).padStart(2, '0')}`, city: 'Cape Town', province: id % 2 ? 'Gauteng' : 'Western Cape', country: 'South Africa', status: id % 2 ? 'pending' : 'published', verified: id % 2 === 0, sapa_registered: id === 0 ? null : true, logo_url: id === 0 ? '/missing-qa-logo.png' : null }));
if (params.has('empty')) rows.length = 0;
const details = Object.fromEntries(rows.map(row => [row.id, { ...row, slug: `synthetic-${row.id}`, about: 'Synthetic club profile', courts: { indoor: { count: 0 }, outdoor: { count: 4, features: ['Lighting'] } }, opening_hours: { mon: { closed: true } }, website_url: 'javascript:alert(1)', services: [{ title: 'Coaching', description: 'Synthetic coaching' }] }]));
window.clubWrites = [];
const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'qa', email: 'qa@example.test' } } }) },
  from(table) {
    if (params.has('error')) throw new Error('Synthetic load failure');
    let start = 0, id, patch; const filters = [];
    return {
      select() { return this; }, order() { return this; }, abortSignal() { return this; }, ilike() { return this; },
      eq(column, value) { if (column === 'id') id = value; filters.push([column, value]); return this; },
      is(column, value) { filters.push([column, value]); return this; },
      update(value) { patch = value; return this; },
      async single() { return this.maybeSingle(); },
      async maybeSingle() {
        if (table === 'admin_sidebar_permissions') return { data: { role: 'super_admin' } };
        if (params.has('detailError')) return { error: { message: 'Synthetic profile failure' } };
        if (patch) {
          window.clubWrites.push({ id, patch, filters });
          await new Promise(resolve => setTimeout(resolve, 300));
          details[id] = { ...details[id], ...patch };
        }
        return { data: details[id] };
      },
      range(value) { start = value; return this; },
      then(resolve) { return new Promise(done => setTimeout(() => done({ data: table === 'clubs' ? rows.slice(start, start + 5) : [] }), 150)).then(resolve); },
    };
  },
};
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{ display: 'block', padding: 24 }}><ClubsWorkspace client={client} session={{ user: { id: 'qa' } }} permissions={{ role: params.has('denied') ? 'custom' : 'super_admin' }} scopeId="all"/></div>);
