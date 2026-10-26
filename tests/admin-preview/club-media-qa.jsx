import React from 'react';
import { createRoot } from 'react-dom/client';
import ClubMedia from '../../src/pages/admin-preview/ClubMedia.jsx';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/FinanceOverview.css';
import '../../src/pages/admin-preview/ClubsWorkspace.css';
const bad = new URLSearchParams(location.search).has('malformed');
const data = { name: 'Synthetic Club', socials: { instagram: 'https://example.com/club', facebook: 'javascript:alert(1)' }, principal_sponsor: { name: 'Synthetic principal', url: 'https://example.com', logo_url: 'https://example.com/missing.png' }, sponsors: bad ? {} : [{ name: 'Synthetic partner', tier: 'Partner' }], gallery: bad ? {} : Array.from({ length: 8 }, (_, id) => ({ url: 'javascript:alert(1)', category: `Image ${id + 1}` })) };
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{ display: 'block', padding: 24 }}><div className="fo-root clubs-root"><ClubMedia data={data}/></div></div>);
