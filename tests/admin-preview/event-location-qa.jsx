import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import EventLocationFields from '../../src/pages/admin-preview/EventLocationFields.jsx';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/EventPaymentDialog.css';
import '../../src/pages/admin-preview/EventDetailsDialog.css';
const clubs = [{ id: 1, name: 'Example Club', city: 'Cape Town', address: '1 Example Street' }, { id: 2, name: 'Second Club', city: 'Durban', address: '2 Example Road' }];
const loadMaps = async () => ({ maps: { event: { clearInstanceListeners(ac) { ac.input.removeEventListener('focus', ac.focus); window.mapsCleaned = true; } }, places: { Autocomplete: class {
  constructor(input, options) {
    this.input = input; window.autocompleteOptions = options;
    this.focus = () => { if (this.container) return; const container = document.createElement('div'); container.className = 'pac-container'; const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Google Mock Venue'; button.style.cssText = 'width:100%;min-height:44px;background:white;color:black'; button.onclick = () => { this.callback?.(); container.style.display = 'none'; }; container.appendChild(button); document.body.appendChild(container); this.container = container; };
    input.addEventListener('focus', this.focus);
  }
  addListener(_, callback) { this.callback = callback; return { remove: () => { this.callback = null; } }; }
  getPlace() { return { name: 'Google Mock Venue', formatted_address: '33 Google Street', address_components: [{ types: ['locality'], long_name: 'Johannesburg' }] }; }
} } } });
function Fixture() {
  const dialog = useRef(null); const [shown, setShown] = useState(true), [draft, setDraft] = useState({ venues: '', address: '', city: '' });
  useEffect(() => { dialog.current.showModal(); }, []);
  return <div className="ap-root"><dialog ref={dialog} className="ap-payment-dialog ap-event-details-dialog"><header><h2>Event location</h2><button type="button" onClick={() => setShown(false)}>Unmount location</button></header><form onSubmit={e => e.preventDefault()}>{shown && <EventLocationFields clubs={clubs} loadMaps={loadMaps} draft={draft} onChange={patch => { setDraft(previous => { const next = { ...previous, ...patch }; window.locationDraft = next; return next; }); }}/>}</form></dialog></div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
