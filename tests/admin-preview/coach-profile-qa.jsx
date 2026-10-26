import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CoachApplicationDrawer from '../../src/pages/admin-preview/CoachApplicationDrawer';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/CoachesWorkspace.css';

const bio = 'I coach players at every level.\nMy sessions focus on confident, thoughtful play.\n\nI have worked with juniors and adult players for many seasons. We build technique through clear feedback and practical match scenarios.\n\n' + Array.from({ length: 9 }, (_, index) => `Coaching note ${index + 1}: Bring your questions and we will build a plan suited to your goals.`).join('\n');
let current = { id: 77, full_name: 'Jordan Example', email: 'jordan@example.test', contact_number: '0820000000', city: 'Cape Town', gender: 'Male', status: 'approved', created_at: '2026-09-01', coaching_location: 'Existing Club · Historic Club', bio, profile_pic_url: '', website_link: 'https://example.test', instagram_link: 'https://instagram.com/example', youtube_link: 'https://youtube.com/example' };
const clubs = [{ id: 1, name: 'Existing Club' }, { id: 2, name: 'Historic Club' }, { id: 3, name: 'New Club' }, { id: 4, name: 'Fourth Club' }];
window.coachProfileWrites = []; window.coachPhotoWrites = []; window.coachProfileReads = []; window.initialCoachBio = bio;
const client = {
  auth: { getUser: async () => ({ data: { user: { email: 'qa@example.test' } } }) },
  from(table) {
    const filters = []; let patch;
    const query = {
      select(columns) { window.coachProfileReads.push({ table, columns }); return query; },
      eq(key, value) { filters.push([key, value]); return query; }, is(key, value) { filters.push([key, value]); return query; },
      ilike() { return query; }, not() { return query; }, order() { return query; },
      async maybeSingle() { return { data: { role: 'super_admin' } }; },
      async range(start, end) { return { data: clubs.slice(start, end + 1) }; },
      update(value) { patch = value; return query; },
      async single() {
        if (!patch) return { data: { ...current } };
        window.coachProfileWrites.push({ patch, filters });
        if (location.search.includes('conflict')) return { error: { message: 'Synthetic conflict' } };
        if (!filters.every(([key, value]) => (current[key] ?? null) === value)) return { data: null };
        await new Promise(resolve => setTimeout(resolve, 150)); current = { ...current, ...patch }; return { data: { ...current } };
      },
    }; return query;
  },
  storage: { from(bucket) { return { async upload(path, blob, options) { window.coachPhotoWrites.push({ bucket, path, type: blob.type, size: blob.size, options }); return {}; }, getPublicUrl(path) { return { data: { publicUrl: `${location.origin}/qa-coach-photo/${path}` } }; } }; } },
};
function Fixture() {
  const [row, setRow] = useState(current), [open, setOpen] = useState(true);
  return <div className="ap-root" style={{ display: 'block', padding: 24 }}><button onClick={() => setOpen(true)}>Open coach</button>{open && <CoachApplicationDrawer row={row} client={client} scopeId="all" onClose={() => setOpen(false)} onSaved={saved => setRow(previous => ({ ...previous, ...saved }))}/>}</div>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);
