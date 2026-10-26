import React from 'react';
import { createRoot } from 'react-dom/client';
import FullClubProfileEditor from '../../src/pages/admin-preview/FullClubProfileEditor';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';

const params = new URLSearchParams(location.search);
const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#d6e4b0"/><path d="M20 100L90 20L170 100Z" fill="#687c3b"/></svg>');
const record = { id: 'qa-club', name: 'Synthetic Padel Club', short_name: 'Synthetic', slug: 'synthetic-padel', status: 'published', updated_at: '2026-09-23T08:00:00Z', about: 'A synthetic club for local testing only.', address: 'Synthetic address', city: 'Cape Town', lat: -33.9, lng: 18.4, logo_url: photo, cover_image_url: photo, website_url: 'https://club.example.test', contact_email: 'club@example.test', contact_phone: '0123456789', whatsapp_number: '0123456789', group_id: null, federation_id: 'f1', brand_color: '#CC1414', verified: true, sapa_registered: true, socials: { instagram: 'https://instagram.com/example', facebook: '', tiktok: '', playtomic: '' }, contacts: [{ name: 'QA Contact', role: 'Manager', email: 'qa@example.test', phone: '0123456789', whatsapp: '0123456789' }], opening_hours: { mon: { open: '08:00', close: '20:00', closed: false } }, courts: { indoor: { count: 2, features: ['Lighting'], image_url: photo }, outdoor: { count: 4, features: [], image_url: '' } }, cafe: { name: 'QA Café', description: 'Local fixture', tags: ['Coffee'], image_url: photo }, services: [{ title: 'Coaching', description: 'Coaching sessions', tags: ['Adult'] }], gallery: [{ url: photo, category: 'courts', caption: 'Synthetic court' }], principal_sponsor: { name: 'QA Sponsor', url: 'https://sponsor.example.test', logo_url: photo }, sponsors: [{ name: 'QA Partner', tier: 'Partner', logo_url: photo }], stats: { players: 10 } };
const groups = [{ id: 'g1', name: 'QA Group', share_logo: true, share_website: true, logo_url: photo, website_url: 'https://group.example.test' }];
window.clubEditorQA = { current: structuredClone(record), groups, writes: [], uploads: [], reads: [], role: params.has('denied') ? 'admin' : 'super_admin' };
const state = window.clubEditorQA;
const client = {
  auth: { getUser: async () => ({ data: { user: { email: 'qa@example.test' } } }) },
  from(table) {
    const filters = []; let patch, start = 0, end = 499;
    const result = () => {
      state.reads.push(table);
      if (table === 'admin_sidebar_permissions') return { data: { role: state.role } };
      if (table === 'clubs') {
        if (patch) {
          if (params.has('failure')) return { data: null, error: new Error('Synthetic save failure') };
          state.writes.push({ patch: structuredClone(patch), filters }); state.current = { ...state.current, ...patch };
        }
        return { data: structuredClone(state.current) };
      }
      return { data: structuredClone((table === 'club_groups' ? state.groups : table === 'federations' ? [{ id: 'f1', name: 'Test Federation', short_name: 'TF' }] : []).slice(start, end + 1)) };
    };
    const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, ilike() { return query; }, is(key, value) { filters.push([key, value]); return query; }, order() { return query; }, update(value) { patch = value; return query; }, single: async () => result(), maybeSingle: async () => result(), range(a, b) { start = a; end = b; return Promise.resolve(result()); } };
    return query;
  },
  storage: { from(bucket) { return {
    upload: async (path, file, options) => { state.uploads.push({ bucket, path, options, type: file.type }); return { error: params.has('uploadFailure') ? new Error('Synthetic upload failure') : null }; },
    getPublicUrl: path => ({ data: { publicUrl: `https://images.example.test/${path}` } }),
  }; } },
};
// Use the production Places attachment with a local Google API mock. No network.
window.google = { maps: { places: { Autocomplete: class {
  constructor(input, options) { state.places = { input, options }; this.place = {}; }
  addListener(name, handler) { state.choosePlace = place => { this.place = place; handler(); }; return { remove() {} }; }
  getPlace() { return this.place; }
  unbindAll() {}
} }, event: { clearInstanceListeners() {}, removeListener() {} } } };
function App() {
  const [open, setOpen] = React.useState(true);
  return <div className="ap-root" style={{ display: 'block' }}><p>SYNTHETIC QA — no live database connection.</p>{open ? <FullClubProfileEditor record={record} client={client} scopeId="all" onClose={() => { state.closed = true; setOpen(false); }} onSaved={value => { state.saved = value; setOpen(false); }}/ > : <p>Editor closed</p>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
