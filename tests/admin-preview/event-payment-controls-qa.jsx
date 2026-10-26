import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EventDemoModal } from '../../src/pages/AdminPreview.jsx';
const team = [
  { id: 'pending-player', full_name: 'Pending Player', division: 'Open doubles', _entryAmount: 0, _paymentDisplay: { label: 'Pending', tone: 'warning' } },
  { id: 'paid-player', full_name: 'Paid Player', division: 'Open doubles', _entryAmount: 500, _paymentDisplay: { label: 'Paid', tone: 'positive' } },
];
function Fixture() {
  const [selection, setSelection] = useState('none');
  const readonly = new URLSearchParams(location.search).has('readonly');
  return <div className="ap-root"><output id="selection">{selection}</output><EventDemoModal action={{ type: 'team', team, registration: team[0] }} event={{ event_name: 'Payment controls QA' }} divisions={[]} onClose={() => {}} onPaymentAction={readonly ? null : (member, type) => setSelection(`${member.id}:${type}`)}/></div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
