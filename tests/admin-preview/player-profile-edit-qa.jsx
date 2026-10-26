import React from 'react';
import { createRoot } from 'react-dom/client';
import PlayerProfileEditDialog from '../../src/pages/admin-preview/PlayerProfileEditDialog';
import '../../src/pages/AdminPreview.css';
const player = { id: 7, name: 'Test Player', email: 'test@example.test', contact_number: '', nationality: 'South African', racket_brand: '', bio: 'Club player' };
window.writes = [];
const client = { auth: { getUser: async () => ({ data: { user: { id: 'qa', email: 'qa@example.test' } } }) }, from(table) {
  let patch;
  const query = { select: () => query, not: () => query, order: () => query, range: start => Promise.resolve({ data: start ? [] : [{ id: 1, name: 'Test Club' }, { id: 2, name: 'Another Club' }] }), ilike: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({ data: { allowed_tabs: ['players'] } }), single: async () => ({ data: { ...player, ...patch } }), update(value) { patch = value; window.writes.push(value); return query; } };
  return query;
} };
createRoot(document.getElementById('root')).render(<div className="ap-root"><PlayerProfileEditDialog player={player} client={client} onClose={() => { window.closed = true; }} onSaved={saved => { window.saved = saved; }}/></div>);
