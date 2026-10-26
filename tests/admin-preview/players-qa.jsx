import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import PlayersWorkspace from '../../src/pages/admin-preview/PlayersWorkspace';
import '../../src/pages/AdminPreview.css';
import { mockReadClient } from './playersTestData.mjs';
const client = mockReadClient();
// Keep the real Players loading branch visible for spacing checks.
if (new URLSearchParams(location.search).has('slow')) {
  const from = client.from.bind(client);
  client.from = (...args) => {
    const query = from(...args), then = query.then.bind(query);
    query.then = (resolve, reject) => new Promise(done => setTimeout(done, 1500)).then(() => then(resolve, reject));
    return query;
  };
}
createRoot(document.getElementById('root')).render(<BrowserRouter><div className="ap-root" style={{ display: 'block', padding: '24px', maxWidth: '1440px', margin: 'auto' }}><p style={{ background: '#fff0d1', padding: '12px' }}>SYNTHETIC UI TEST — no real player data, no database connection.</p><PlayersWorkspace session={{ user: { id: 'qa-only' } }} client={client} /></div></BrowserRouter>);
