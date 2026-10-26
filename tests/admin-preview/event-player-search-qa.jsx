import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EventPlayerSearch from '../../src/pages/admin-preview/EventPlayerSearch.jsx';
import '../../src/pages/AdminPreview.css';
async function search(q) { if (q === 'error') throw new Error('Search failed'); return q === 'brad' ? [{ id: '1', name: 'Brad Example', email: 'brad@example.test' }] : []; }
function Fixture() { const [player,setPlayer] = useState(null); return <div className="ap-root" style={{display:'block',padding:24}}><div className="ap-demo-form"><EventPlayerSearch selected={player} onSelect={setPlayer} search={search}/><button disabled={!player}>Continue</button></div></div>; }
createRoot(document.getElementById('root')).render(<Fixture/>);
