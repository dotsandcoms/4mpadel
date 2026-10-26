import React from 'react';
import { createRoot } from 'react-dom/client';
import EventPairDialog from '../../src/pages/admin-preview/EventPairDialog.jsx';
import '../../src/pages/AdminPreview.css';
const solo = { id: 1, event_id: 9, full_name: 'Example Solo', email: 'solo@example.test', division: 'Open', status: 'registered', payment_status: 'pending' };
const registrations = [solo, { ...solo, id: 2, full_name: 'Example Partner', email: 'partner@example.test', payment_status: 'paid' }];
createRoot(document.getElementById('root')).render(<div className="ap-root"><EventPairDialog event={{ id: 9, event_name: 'Example Event' }} solo={solo} registrations={registrations} search={async () => [{ id: 3, name: 'Directory Player', email: 'directory@example.test' }]} onClose={result => { window.closedPair = result; }} save={async data => { window.savedPair = data; await new Promise(resolve => setTimeout(resolve, 1000)); return { warnings: [] }; }}/></div>);
