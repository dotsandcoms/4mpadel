/* eslint-disable react-refresh/only-export-components -- standalone local demo */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import TournamentManager from '../../src/components/admin/tournament/TournamentManager';
import { demoClient, resetDemo, setDemoRole } from './client';
import { ROLE_PRESETS } from '../../src/utils/tournament/permissions';
import '../../src/index.css';
function App() {
    const [scenario, setScenario] = useState('schedule');
    const [version, setVersion] = useState(0);
    return <div style={{ maxWidth: 1480, margin: '0 auto', padding: '20px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, color: '#c6d7df', marginBottom: 16, fontSize: 13 }}><span>4M PADEL · TOURNAMENT MANAGER · LOCAL PREVIEW</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><label>Preview as <select aria-label="Preview role" style={{ background: '#132129', color: 'white', padding: 6, borderRadius: 4 }} onChange={e => { setDemoRole(ROLE_PRESETS[e.target.value].capabilities); setVersion(v => v + 1); }}>{Object.entries(ROLE_PRESETS).map(([id, r]) => <option value={id} key={id}>{r.label}</option>)}</select></label><select aria-label="Demo starting point" style={{ background: '#132129', color: 'white' }} value={scenario} onChange={e => setScenario(e.target.value)}><option value="schedule">Published draws</option><option value="prepare">Start preparation</option></select><button style={{ textDecoration: 'underline' }} onClick={() => { if (confirm('Reset only this browser’s synthetic tournament?')) { resetDemo(scenario); setVersion(v => v + 1); } }}>Reset demo</button></div></div>
        <TournamentManager key={version} client={demoClient} demo />
    </div>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
