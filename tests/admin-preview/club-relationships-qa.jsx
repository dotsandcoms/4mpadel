import React from 'react';
import { createRoot } from 'react-dom/client';
import ClubGroupsView from '../../src/pages/admin-preview/ClubGroupsView.jsx';
import ClubOrganisations from '../../src/pages/admin-preview/ClubOrganisations.jsx';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/FinanceOverview.css';
import '../../src/pages/admin-preview/ClubsWorkspace.css';
const tables = {
  club_organisations: [{ id: 'link', club_id: 'club', organisation_id: 'org', organisations: { id: 'org', name: 'Synthetic linked organiser', status: 'approved' } }],
  organisations: [{ id: 'org', name: 'Synthetic linked organiser' }, { id: 'new', name: 'Another synthetic organiser' }],
  club_groups: [{ id: 'group', name: 'Synthetic club group', city: 'Cape Town', status: 'published', share_logo: true, share_website: false }],
  clubs: [{ id: 'club', name: 'Synthetic venue', city: 'Cape Town', group_id: 'group' }],
};
const client = { rpc: async () => ({ data: true }), auth: { getUser: async () => ({ data: { user: { id: 'actor', email: 'admin@example.invalid' } } }) }, from(table) {
  const q = { select() { return q; }, eq() { return q; }, order() { return q; }, ilike() { return q; }, range(start) { q.start = start; return q; }, abortSignal() { return q; }, maybeSingle: async () => ({ data: { role: 'super_admin' } }), then(resolve) { return Promise.resolve({ data: (tables[table] || []).slice(q.start || 0) }).then(resolve); } }; return q;
} };
const session = { user: { id: 'actor' } };
createRoot(document.getElementById('root')).render(<main className="ap-root" style={{ padding: 24 }}><h1>Synthetic club relationships</h1><p>No write methods or external data connections.</p><ClubGroupsView client={client} session={session} scopeId="all" onOpenClub={club => { document.getElementById('opened').textContent = club.name; }}/><p id="opened" role="status"/><ClubOrganisations client={client} session={session} scopeId="all" club={{ id: 'club', name: 'Synthetic venue' }}/></main>);
