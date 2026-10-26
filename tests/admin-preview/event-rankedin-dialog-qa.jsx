import React from 'react';
import { createRoot } from 'react-dom/client';
import EventRankedinDialog from '../../src/pages/admin-preview/EventRankedinDialog.jsx';
import '../../src/pages/AdminPreview.css';
createRoot(document.getElementById('root')).render(<div className="ap-root"><EventRankedinDialog event={{ id: 42, event_name: 'Example Open', is_manual: true, rankedin_id: '123' }} onClose={result => { window.closedResult = result; }} save={async () => {
  window.syncCalls = (window.syncCalls || 0) + 1;
  return { ok: true, mapping: { mapped: [1, 2], unmatchedLocal: [{ divisionName: 'Mixed Open' }] }, writePush: { pushed: 3, skipped: [{ reason: 'solo_entry', playerName: 'Example Player' }], errors: [] }, detailsPush: { updated: ['venue'], errors: [] }, nextSteps: ['Pair solo entries before syncing them.'] };
}} /></div>);
