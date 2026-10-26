import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CoachesWorkspace from '../../src/pages/admin-preview/CoachesWorkspace';
import { mockReadClient } from './playersTestData.mjs';
import '../../src/pages/AdminPreview.css';
const rows = Array.from({ length: 65 }, (_, index) => ({ id: index + 1, full_name: `QA Coach ${index + 1}`, email: `coach${index + 1}@example.test`, gender: index % 2 ? 'Female' : 'Male', city: 'Cape Town', coaching_location: 'QA Club', status: ['pending', 'approved', 'rejected'][index % 3], created_at: '2026-09-22', bio: 'Synthetic coach biography' }));
const client = mockReadClient({ coach_applications: rows });
window.coachWrites = [];
client.auth = { getUser: async () => ({ data: { user: { email: 'qa@example.test' } } }) };
const readFrom = client.from.bind(client);
client.from = table => {
  if (table === 'admin_sidebar_permissions') { const grant = { select: () => grant, ilike: () => grant, maybeSingle: async () => ({ data: { role: 'super_admin' } }) }; return grant; }
  const query = readFrom(table);
  query.update = patch => {
    let id, status;
    const write = { eq(key, value) { if (key === 'id') id = value; if (key === 'status') status = value; return write; }, is(key, value) { status = value; return write; }, select: () => write, single: async () => {
      window.coachWrites.push(patch);
      const row = rows.find(row => row.id === id && row.status === status);
      if (!row || location.search.includes('conflict')) return { data: null, error: { message: 'Conflict' } };
      Object.assign(row, patch); return { data: { id: row.id, status: row.status } };
    } }; return write;
  }; return query;
};
window.coachCalls = client.calls;
createRoot(document.getElementById('root')).render(<BrowserRouter><div className="ap-root" style={{ display: 'block', padding: 24 }}><CoachesWorkspace session={{ user: { id: 'qa' } }} permissions={location.search.includes('denied') ? {} : { role: 'super_admin' }} scopeId="all" client={client}/></div></BrowserRouter>);
