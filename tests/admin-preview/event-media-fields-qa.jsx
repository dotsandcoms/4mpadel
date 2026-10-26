import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EventMediaFields, { EventMediaPreview } from '../../src/pages/admin-preview/EventMediaFields.jsx';
import '../../src/pages/AdminPreview.css';
function Fixture() {
  const url = path => `${location.origin}${path}`;
  const [draft, setDraft] = useState({ custom_image_url: url('/images/events/major_bg.jpg'), poster_image_url: url('/images/events/gold_bg.jpg'), poster_document_url: '', organiser_logo_url: url('/images/babolat.png'), organiser_kit_url: 'https://example.test/document.pdf', sponsor_logos: [url('/images/babolat.png'), url('/images/steri-stumpie.png')].join('\n'), media_gallery_urls: url('/images/events/silver_bg.jpg') });
  window.mediaDraft = draft;
  async function fakeUpload(file, prefix) {
    window.uploadCalls = [...(window.uploadCalls || []), { name: file.name, prefix }];
    if (file.name.includes('fail')) throw new Error('Fixture upload failed');
    return url(prefix === 'event-posters' ? '/fixture-poster.pdf' : '/images/events/bronze_bg.jpg');
  }
  return <main className="ap-root" style={{ padding: 20, maxWidth: 950, margin: 'auto' }}><EventMediaFields draft={draft} onChange={patch => setDraft(previous => ({ ...previous, ...patch }))} onBusyChange={value => { window.uploadBusy = value; }} uploadImage={fakeUpload} uploadAsset={fakeUpload} /><h2>Review example</h2><EventMediaPreview field="sponsor_logos" value={draft.sponsor_logos} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
