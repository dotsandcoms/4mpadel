import React from 'react';
import { createRoot } from 'react-dom/client';
import { LiveEventCommandCentre } from '../../src/pages/AdminPreview.jsx';

const registrations = [1, 2].map(id => ({ id, event_id: 99, full_name: `Solo Player ${id}`, email: `solo${id}@example.test`, division: 'Open', division_id: 10, status: 'registered', payment_status: 'pending', _player: { points: id * 100 } }));
window.refreshCount = 0;
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{ display: 'block', padding: 24 }}><LiveEventCommandCentre
  event={{ id: 99, event_name: 'Integration fixture', is_manual: true, rankedin_id: '12345', start_date: '2026-10-01', end_date: '2026-10-02', organiser_email: 'organiser@example.test' }}
  registrations={registrations} payments={[]} divisions={[{ id: 10, event_id: 99, name: 'Open', entry_fee: 500 }]} activity={[]}
  canManagePayments={!new URLSearchParams(location.search).has('readonly')} go={() => {}} onRefresh={() => { window.refreshCount++; }}
/></div>);
