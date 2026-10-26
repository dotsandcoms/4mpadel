import React from 'react';
import { createRoot } from 'react-dom/client';
import EventDetailsDialog from '../../src/pages/admin-preview/EventDetailsDialog.jsx';
import '../../src/pages/AdminPreview.css';
const event = { id: 25, event_name: 'Example Open', organiser_name: 'Example Club', organiser_email: 'club@example.test', organiser_phone: '', organiser_website: '', contact_details: 'Jo', description: '<p>An event with <strong>formatted content</strong>.</p>', points_breakdown: '<h3>Ranking points</h3><p>Points awarded for the <strong>final position</strong>.</p>', sponsor_logos: [`${location.origin}/images/kitkat-group-logo.png`, `${location.origin}/images/slow-mag.png`], custom_image_url: `${location.origin}/images/event_background.jpeg` };
const load = async () => event;
const loadDivisions = async () => [{ id: 1, name: "Men's Open", entry_fee: 600, is_active: true }];
createRoot(document.getElementById('root')).render(<div className="ap-root"><EventDetailsDialog event={event} load={load} loadDivisions={loadDivisions} locationProps={{ clubs: [{ id: 1, name: 'Fixture Padel Club', city: 'Cape Town', address: '1 Test Road' }], ...(location.search.includes('live-maps') ? {} : { loadMaps: async () => null }) }} mediaProps={{ uploadImage: async () => `${location.origin}/images/kitkat-group-logo.png`, uploadAsset: async () => `${location.origin}/fixture.pdf` }} onClose={result => { window.closedResult = result; }} save={async data => { window.savedDetails = { event: data.event, draft: data.draft, divisionDrafts: data.divisionDrafts }; return { changed: true }; }}/></div>);
