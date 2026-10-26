import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/pages/AdminPreview.css';
import EventCancellationDialog from '../../src/pages/admin-preview/EventCancellationDialog';
createRoot(document.getElementById('root')).render(<div className="ap-root"><EventCancellationDialog event={{ id: 7, event_name: 'Cancellation QA — no live writes' }} divisions={[{ id: 4, name: "Men’s Open" }, { id: 5, name: "Women’s Open" }]} scope={location.search.includes('division') ? 'division' : 'event'} onClose={result => { document.body.dataset.closed = JSON.stringify(result); }} save={async args => { window.saved = { divisionId: args.divisionId, reason: args.reason }; return { registrations_processed: 3, refund_status: 'needs_attention' }; }}/></div>);
