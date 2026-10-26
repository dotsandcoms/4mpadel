import React, { useEffect, useRef } from 'react';
import { formatRegistrationLicenseLabel } from './utils/registrationLicense';

// Read only: use the authorised tournament snapshot, never fetch a broader profile.
export default function PlayerProfile({ registration, initialProfile, eventId, eventRegistrations = [], onClose }) {
    const ref = useRef(null);
    useEffect(() => { const node = ref.current; const previous = document.activeElement; node.showModal(); return () => { node.close(); previous?.focus(); }; }, []);
    return <dialog className="tm-dialog" ref={ref} onCancel={onClose} aria-labelledby="tm-profile-title"><div className="tm-stack">
        <div className="tm-between"><h2 id="tm-profile-title">{initialProfile?.name || registration.full_name}</h2><button className="tm-button quiet" onClick={onClose}>Close</button></div>
        <p className="muted">Player details from this tournament’s authorised records.</p>
        <dl className="tm-profile-list">{[['Email', registration.email], ['Partner', registration.partner_name], ['Partner email', registration.partner_email], ['Payment', registration.payment_status], ['Licence', formatRegistrationLicenseLabel(registration.email, eventId, initialProfile)], ['Ranking points', initialProfile?.points], ['Ranking', initialProfile?.active_ranking_label || initialProfile?.rank_label], ['Category', initialProfile?.category], ['Gender', initialProfile?.gender]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Not available'}</dd></div>)}</dl>
        <section className="tm-stack"><h3>Entries in this event</h3>{eventRegistrations.filter(entry => [entry.email, entry.partner_email].some(email => email?.trim().toLowerCase() === registration.email?.trim().toLowerCase())).map(entry => <div className="tm-list-item" key={entry.id}><div><strong>{entry.full_name}{entry.partner_name ? ' / ' + entry.partner_name : ''}</strong><p className="muted">{entry.status || 'Registered'} · {entry.payment_status || 'Payment status unavailable'}</p></div></div>)}</section>
        {!initialProfile && <p className="tm-notice">No linked player profile is included in this tournament snapshot.</p>}
    </div></dialog>;
}
