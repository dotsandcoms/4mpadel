import React from 'react';
import { createRoot } from 'react-dom/client';
import AccessWorkspace from '../../src/pages/admin-preview/AccessWorkspace';
import '../../src/pages/AdminPreview.css';

const tables = {
  admin_sidebar_permissions: [{ email: 'manager@example.com', role: 'custom', allowed_tabs: ['calendar', 'event-mgmt'], module_permissions: { 'event-mgmt': { allowedEvents: [1] } }, created_at: '2026-09-01T10:00:00Z' }, ...Array.from({ length: 22 }, (_, i) => ({ email: `sample${i + 1}@example.com`, role: 'custom', allowed_tabs: ['players'], module_permissions: {}, created_at: '2026-09-02T10:00:00Z' }))],
  players: [{ id: 'qa-player', name: 'Sample Event Manager', email: 'manager@example.com' }],
  calendar: [{ id: 1, event_name: 'Sample Open', start_date: '2026-09-15' }, { id: 2, event_name: 'Sample Club Cup', start_date: '2026-10-01' }, ...Array.from({ length: 40 }, (_, i) => ({ id: i + 3, event_name: `Pagination Test Event ${i + 3}`, start_date: '2026-11-01' }))],
  organisation_members: [{ id: 'membership', role: 'admin', organisations: { id: 'org', name: 'Sample Organisation' } }], club_members: [], federation_members: [],
};
const client = { from(table) {
  let start = 0, end = Infinity;
  return { select() { return this; }, order() { return this; }, in() { return this; }, ilike() { return this; }, limit(value) { end = value - 1; return this; }, abortSignal() { return this; }, range(a, b) { start = a; end = b; return this; }, then(resolve) { return Promise.resolve({ data: (tables[table] || []).slice(start, end + 1), error: null }).then(resolve); } };
} };
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{ display: 'block', padding: 24 }}><p>SYNTHETIC ACCESS TEST — no database connection.</p><AccessWorkspace session={{ user: { id: 'qa-only' } }} permissions={{ role: 'super_admin' }} client={client} /></div>);
