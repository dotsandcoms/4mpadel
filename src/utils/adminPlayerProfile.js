import { ageFromBirthDate, playtomicPrivateFields } from './profileDetails.js';

const list = value => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
};

export function adminPlayerForm(player = {}) {
    const sponsors = Array.isArray(player.sponsors) ? player.sponsors : list(player.sponsors);
    return {
        id: player.id, name: player.name || '', rank_label: player.rank_label || '',
        points: player.points ?? '', win_rate: player.win_rate ?? '', image_url: player.image_url || '',
        home_club: player.club_id ? '' : (player.home_club || ''), club_id: player.club_id || '',
        age_group: player.age_group || '', category: player.category || '', level: player.level ?? '',
        nationality: player.nationality || '', bio: player.bio || '',
        sponsors: sponsors.length ? sponsors.join(', ') : (typeof player.sponsors === 'string' && !player.sponsors.startsWith('[') ? player.sponsors : ''),
        contact_number: player.contact_number || '', email: player.email || '', gender: player.gender || '',
        approved: player.approved !== false, paid_registration: player.paid_registration === true,
        license_type: player.license_type || 'none', region: player.region || '', racket_brand: player.racket_brand || '',
        id_number: player.id_number || '', instagram_link: player.instagram_link || '',
        playing_hand: player.playing_hand || '', court_side: player.court_side || '',
        additional_images: list(player.additional_images).filter(value => typeof value === 'string'),
        date_of_birth: '', playtomic_level: '', playtomic_proof_path: '', ...playtomicPrivateFields(null),
    };
}

export function privateProfileForm(details) {
    return { ...playtomicPrivateFields(details), date_of_birth: details?.date_of_birth || '', playtomic_level: details?.playtomic_level ?? '',
        playtomic_proof_path: details?.playtomic_proof_path || '' };
}

export function privateProfileChanged(form, original) {
    const previous = privateProfileForm(original);
    return ['date_of_birth', 'playtomic_level', 'playtomic_proof_path', 'playtomic_no_profile'].some(key => String(form[key] ?? '') !== String(previous[key]));
}

/** Explicit public fields: birth dates and proof paths only go through the checked RPC. */
export function adminPlayerPayload(form, clubs = []) {
    const fields = ['name', 'rank_label', 'win_rate', 'image_url', 'age_group', 'category', 'level', 'nationality',
        'bio', 'contact_number', 'email', 'gender', 'approved', 'region', 'racket_brand', 'id_number', 'instagram_link'];
    const payload = Object.fromEntries(fields.map(key => [key, form[key]]));
    const club = clubs.find(c => String(c.id) === String(form.club_id));
    Object.assign(payload, {
        name: form.name.trim(), email: form.email.trim(), points: Number.parseInt(form.points, 10) || 0,
        home_club: form.club_id === 'Other' || !form.club_id ? form.home_club : (club?.name || form.home_club),
        club_id: form.club_id === 'Other' ? null : (form.club_id || null),
        sponsors: JSON.stringify(String(form.sponsors || '').split(',').map(s => s.trim()).filter(Boolean)),
        playing_hand: form.playing_hand || null, court_side: form.court_side || null,
        additional_images: JSON.stringify(form.additional_images || []),
    });
    const age = ageFromBirthDate(form.date_of_birth);
    if (age !== null) payload.age = age;
    return payload;
}
