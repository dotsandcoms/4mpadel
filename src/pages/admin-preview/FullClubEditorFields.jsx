import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2, Upload } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { CLUB_STATUSES, normalizeClubStatus } from '../../utils/club';
import { attachPlacesAutocomplete } from '../../utils/googleMaps';
import './FullClubEditor.css';

const DAYS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const COLORS = ['#CC1414', '#9AE900', '#F97316', '#3B82F6', '#EF4444', '#A855F7', '#14B8A6', '#EAB308', '#EC4899'];
function Field({ label, value, onChange, multiline, ...props }) {
  const Control = multiline ? 'textarea' : 'input';
  return <label className="ap-full-club-field"><span>{label}</span><Control {...props} value={value ?? ''} onChange={event => onChange(event.target.value)}/></label>;
}
function Section({ title, children, initialOpen = false }) {
  return <details className="ap-full-club-section" open={initialOpen || undefined}><summary>{title}</summary><div className="ap-full-club-section-body">{children}</div></details>;
}
function CsvField({ label, value = [], onChange }) {
  const [text, setText] = useState(value.join(', '));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value.join(', ')); }, [value]);
  return <Field label={label} value={text} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(value.join(', ')); }} onChange={next => { setText(next); onChange(next.split(',').map(item => item.trim()).filter(Boolean)); }}/>;
}
function Media({ title, url, kind, onUpload, uploading, inherited }) {
  return <div className="ap-full-club-media">
    {url ? <img src={url} alt={`${title} preview`} width="128" height="88"/> : <div className="ap-full-club-media-empty"><ImagePlus size={24} aria-hidden="true"/><span>No image</span></div>}
    <div><strong>{title}</strong>{inherited ? <p>Inherited from {inherited}</p> : <><label className="ap-full-club-upload"><Upload size={15} aria-hidden="true"/>{uploading === kind ? 'Preparing…' : 'Choose image'}<input aria-label={`Upload ${title}`} type="file" accept="image/*" disabled={!!uploading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUpload(file, kind); }}/></label><p>Uploads when you confirm changes.</p></>}</div>
  </div>;
}

// Address binding is mounted once; typing does not replace the input or widget.
function ClubAddress({ value, onChange }) {
  const input = useRef(null), latest = useRef(onChange);
  latest.current = onChange;
  const [status, setStatus] = useState('Selecting a Google result fills city, latitude and longitude.');
  useEffect(() => {
    let cancelled = false, api, observer;
    const field = input.current, dialog = field?.closest('dialog');
    const before = new Set(document.querySelectorAll('.pac-container')), owned = new Set();
    const position = () => {
      if (!dialog || !field) return;
      const rect = field.getBoundingClientRect(), below = innerHeight - rect.bottom - 12;
      const height = Math.max(100, Math.min(250, below < 150 ? rect.top - 12 : below));
      owned.forEach(container => {
        const styles = { position: 'fixed', left: `${rect.left}px`, top: `${below < 150 ? Math.max(4, rect.top - height - 4) : rect.bottom + 4}px`, width: `${rect.width}px`, maxHeight: `${height}px`, overflowY: 'auto', zIndex: '20' };
        Object.entries(styles).forEach(([key, next]) => { if (container.style[key] !== next) container.style[key] = next; });
      });
    };
    const claim = () => {
      if (!dialog) return;
      document.querySelectorAll('.pac-container').forEach(container => {
        if (before.has(container) || owned.has(container)) return;
        owned.add(container); container.classList.add('ap-full-club-google'); dialog.appendChild(container);
        observer?.observe(container, { attributes: true, attributeFilter: ['style'] });
      });
      position();
    };
    attachPlacesAutocomplete(field, { country: 'za', onPlace: place => {
      if (cancelled || field.matches(':disabled')) return;
      const components = place.address_components || [], get = type => components.find(item => item.types.includes(type))?.long_name || '';
      const city = get('locality') || get('sublocality') || get('administrative_area_level_2') || get('administrative_area_level_1');
      if (place.formatted_address) latest.current('address', place.formatted_address);
      if (city) latest.current('city', city);
      if (place.geometry?.location) { latest.current('lat', String(place.geometry.location.lat())); latest.current('lng', String(place.geometry.location.lng())); }
    } }).then(result => {
      if (cancelled) { result.destroy(); return; }
      api = result;
      observer = new MutationObserver(claim);
      observer.observe(document.body, { childList: true, subtree: true }); claim();
      field.addEventListener('focus', position); window.addEventListener('resize', position); document.addEventListener('scroll', position, true);
    }).catch(() => { if (!cancelled) setStatus('Google suggestions are unavailable. You can still enter the address, city and coordinates.'); });
    return () => { cancelled = true; observer?.disconnect(); api?.destroy(); owned.forEach(container => container.remove()); field?.removeEventListener('focus', position); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); };
  }, []);
  return <label className="ap-full-club-field ap-full-club-wide"><span>Address</span><input ref={input} value={value || ''} onChange={event => onChange('address', event.target.value)} autoComplete="off" placeholder="Start typing to search Google…"/><small role="status">{status}</small></label>;
}

export default function FullClubEditorFields({ draft, onChange, groups = [], federations = [], onUpload, uploading }) {
  const latest = useRef({ draft, onChange }); latest.current = { draft, onChange };
  const [uploadError, setUploadError] = useState('');
  const group = groups.find(item => String(item.id) === String(draft.group_id));
  const inheritLogo = !!(group?.share_logo && group.logo_url), inheritWebsite = !!(group?.share_website && group.website_url);
  const field = (name, label, props = {}) => <Field key={name} name={name} label={label} value={draft[name]} onChange={value => onChange(name, value)} {...props}/>;
  const nested = (name, key, value) => onChange(name, { ...(draft[name] || {}), [key]: value });
  const updateRow = (name, index, key, value) => onChange(name, (draft[name] || []).map((row, i) => i === index ? { ...row, [key]: value } : row));
  const removeRow = (name, index) => onChange(name, (draft[name] || []).filter((_, i) => i !== index));
  const upload = async (file, kind) => {
    setUploadError('');
    try {
      const url = await onUpload(file, kind); if (!url) return;
      const { draft: current, onChange: change } = latest.current;
      if (kind === 'logo') change('logo_url', url);
      else if (kind === 'cover') change('cover_image_url', url);
      else if (kind === 'gallery') change('gallery', [...(current.gallery || []), { url, category: 'other', caption: '' }]);
      else if (kind === 'indoor' || kind === 'outdoor') change('courts', { ...(current.courts || {}), [kind]: { ...(current.courts?.[kind] || {}), image_url: url } });
      else if (kind === 'cafe') change('cafe', { ...(current.cafe || { name: '', description: '', tags: [] }), image_url: url });
      else if (kind === 'principal') change('principal_sponsor', { ...(current.principal_sponsor || { name: '', url: '' }), logo_url: url });
    } catch (error) { setUploadError(error.message || 'Upload failed. Please try again.'); }
  };
  const media = (title, kind, url, inherited) => <Media title={title} kind={kind} url={url} inherited={inherited} uploading={uploading} onUpload={upload}/>;
  const repeated = (name, title, fields, empty) => <Section title={`${title} (${(draft[name] || []).length})`}><button type="button" className="ap-button ap-button-secondary" onClick={() => onChange(name, [...(draft[name] || []), { ...empty }])}><Plus size={16}/>Add {name === 'services' ? 'service' : name === 'contacts' ? 'contact' : 'sponsor'}</button>{(draft[name] || []).map((row, index) => <div className="ap-full-club-repeat" key={index}><div className="ap-full-club-grid">{fields.map(([key, label]) => <Field key={key} label={label} value={row[key]} onChange={value => updateRow(name, index, key, value)}/>)}</div><button type="button" className="ap-full-club-remove" aria-label={`Remove ${title.toLowerCase()} ${index + 1}`} onClick={() => removeRow(name, index)}><Trash2 size={15}/>Remove</button></div>)}</Section>;
  return <div className="ap-full-club-fields">
    {uploadError && <p role="alert" className="ap-full-club-error">{uploadError}</p>}
    <Section title="Profile" initialOpen><div className="ap-full-club-grid">
      {field('name', 'Name', { required: true })}{field('short_name', 'Short name')}{field('slug', 'Public page slug', { required: true })}
      <label className="ap-full-club-field"><span>Status</span><SearchableDropdown value={normalizeClubStatus(draft.status)} onChange={event => onChange('status', event.target.value)}>{normalizeClubStatus(draft.status) === 'rejected' && <option value="rejected">Rejected</option>}{CLUB_STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</SearchableDropdown></label>
      <div className="ap-full-club-checks"><label><input type="checkbox" checked={!!draft.verified} onChange={event => onChange('verified', event.target.checked)}/>Verified</label><label><input type="checkbox" checked={!!draft.sapa_registered} onChange={event => onChange('sapa_registered', event.target.checked)}/>SAPA registered</label></div>
      <ClubAddress value={draft.address} onChange={onChange}/>{field('city', 'City')}{field('about', 'About', { multiline: true, rows: 4 })}
      <label className="ap-full-club-field"><span>Club group</span><SearchableDropdown value={draft.group_id || ''} onChange={event => onChange('group_id', event.target.value)}><option value="">None (standalone venue)</option>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SearchableDropdown><small>Optional brand group for this venue.</small></label>
      <div>{field('website_url', 'Website', { value: inheritWebsite ? group.website_url : draft.website_url, disabled: inheritWebsite, readOnly: inheritWebsite })}{inheritWebsite && <small>Inherited from {group.name}</small>}</div>
      {field('contact_email', 'Contact email')}{field('contact_phone', 'Contact phone', { type: 'tel' })}{field('whatsapp_number', 'WhatsApp', { type: 'tel' })}{field('lat', 'Latitude')}{field('lng', 'Longitude')}
    </div><div className="ap-full-club-grid">{media('Club logo', 'logo', inheritLogo ? group.logo_url : draft.logo_url, inheritLogo ? group.name : null)}{media('Hero cover', 'cover', draft.cover_image_url)}</div>
    <div className="ap-full-club-colors"><strong>Brand colour</strong><p>Accents on the public club page.</p><div>{COLORS.map(color => <button type="button" key={color} aria-label={`Brand colour ${color}`} aria-pressed={draft.brand_color === color} style={{ backgroundColor: color }} onClick={() => onChange('brand_color', color)}/>)}<label>Custom colour<input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.brand_color || '') ? draft.brand_color : '#CC1414'} onChange={event => onChange('brand_color', event.target.value)}/></label><span>{draft.brand_color || '#CC1414'}</span></div></div></Section>
    <Section title="Principal sponsor banner"><div className="ap-full-club-grid">{['name', 'url'].map(key => <Field key={key} label={key === 'name' ? 'Sponsor name' : 'Sponsor URL'} value={draft.principal_sponsor?.[key]} onChange={value => nested('principal_sponsor', key, value)}/>)}</div>{media('Principal sponsor logo', 'principal', draft.principal_sponsor?.logo_url)}{draft.principal_sponsor && <button className="ap-full-club-remove" type="button" onClick={() => onChange('principal_sponsor', null)}>Clear principal sponsor</button>}</Section>
    <Section title="Social media"><div className="ap-full-club-grid">{[['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['playtomic', 'Playtomic']].map(([key, label]) => <Field key={key} label={label} value={draft.socials?.[key]} onChange={value => nested('socials', key, value)}/>)}{field('whatsapp_number', 'WhatsApp', { type: 'tel' })}</div></Section>
    <Section title="Courts">{['indoor', 'outdoor'].map(side => <div className="ap-full-club-repeat" key={side}><h4>{side === 'indoor' ? 'Indoor' : 'Outdoor'} courts</h4><div className="ap-full-club-grid"><Field label="Count" type="number" min="0" value={draft.courts?.[side]?.count ?? 0} onChange={value => nested('courts', side, { ...(draft.courts?.[side] || {}), count: Number(value) || 0 })}/><CsvField label="Features (comma-separated)" value={draft.courts?.[side]?.features} onChange={value => nested('courts', side, { ...(draft.courts?.[side] || {}), features: value })}/></div>{media(`${side} court photo`, side, draft.courts?.[side]?.image_url)}</div>)}</Section>
    <Section title="Café / Restaurant"><div className="ap-full-club-grid">{[['name', 'Name'], ['hours_note', 'Hours note'], ['description', 'Description']].map(([key, label]) => <Field key={key} label={label} value={draft.cafe?.[key]} multiline={key === 'description'} rows={3} onChange={value => nested('cafe', key, value)}/>)}<CsvField label="Tags (comma-separated)" value={draft.cafe?.tags} onChange={value => nested('cafe', 'tags', value)}/></div>{media('Café photo', 'cafe', draft.cafe?.image_url)}</Section>
    {repeated('services', 'Services', [['title', 'Title'], ['description', 'Description']], { title: '', description: '', tags: [] })}
    <Section title="Opening hours">{Object.entries(DAYS).map(([day, label]) => <div className="ap-full-club-hours" key={day}><strong>{label}</strong><Field label={`${label} opens`} type="time" value={draft.opening_hours?.[day]?.open} disabled={!!draft.opening_hours?.[day]?.closed} onChange={value => nested('opening_hours', day, { ...(draft.opening_hours?.[day] || {}), open: value })}/><Field label={`${label} closes`} type="time" value={draft.opening_hours?.[day]?.close} disabled={!!draft.opening_hours?.[day]?.closed} onChange={value => nested('opening_hours', day, { ...(draft.opening_hours?.[day] || {}), close: value })}/><label className="ap-full-club-closed"><input type="checkbox" checked={!!draft.opening_hours?.[day]?.closed} onChange={event => nested('opening_hours', day, { ...(draft.opening_hours?.[day] || {}), closed: event.target.checked })}/>Closed</label></div>)}</Section>
    <Section title={`Gallery (${(draft.gallery || []).length})`}>{media('Gallery image', 'gallery')}<div className="ap-full-club-grid">{(draft.gallery || []).map((item, index) => <div className="ap-full-club-gallery" key={index}><img src={item.url} alt={item.caption || `Gallery image ${index + 1}`} width="360" height="200"/><label className="ap-full-club-field"><span>Category</span><SearchableDropdown value={item.category || 'other'} onChange={event => updateRow('gallery', index, 'category', event.target.value)}>{['courts', 'cafe', 'facilities', 'events', 'other'].map(category => <option key={category} value={category}>{category}</option>)}</SearchableDropdown></label><Field label="Caption" value={item.caption} onChange={value => updateRow('gallery', index, 'caption', value)}/><button type="button" className="ap-full-club-remove" aria-label={`Remove gallery image ${index + 1}`} onClick={() => removeRow('gallery', index)}><Trash2 size={15}/>Remove image</button></div>)}</div></Section>
    {repeated('sponsors', 'Sponsors & partners', [['name', 'Name'], ['tier', 'Tier']], { name: '', tier: 'Partner', logo_url: '' })}
    {repeated('contacts', 'Contacts', [['name', 'Name'], ['role', 'Role'], ['email', 'Email'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp']], { name: '', role: '', email: '', phone: '', whatsapp: '' })}
    <Section title="Federation"><label className="ap-full-club-field"><span>Linked federation</span><SearchableDropdown value={draft.federation_id || ''} onChange={event => onChange('federation_id', event.target.value)}><option value="">None</option>{federations.map(item => <option key={item.id} value={item.id}>{item.short_name || item.name}</option>)}</SearchableDropdown></label></Section>
  </div>;
}
