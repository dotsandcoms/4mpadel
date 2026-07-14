import React, { useEffect, useMemo, useState } from 'react';
import {
    X, Loader2, Mail, Phone, MapPin, Trophy, CreditCard, User, ExternalLink, Link2, CheckCircle,
    Shield, Calendar, Users,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { resolveRegistrationLicenseDisplay } from '../../utils/registrationLicense';

const fmtPayment = (status) => {
    const key = String(status || 'pending').toLowerCase();
    if (key === 'paid') return { label: 'Paid', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
    if (key === 'pending' || key === 'unpaid') return { label: 'Pending', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/25' };
    if (key === 'refunded') return { label: 'Refunded', cls: 'bg-gray-500/15 text-gray-300 border-gray-500/25' };
    return { label: key.charAt(0).toUpperCase() + key.slice(1), cls: 'bg-white/10 text-gray-300 border-white/15' };
};

const LicenseBadge = ({ display }) => {
    const cfg = {
        full: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: Shield },
        temp: { cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30', icon: Shield },
        active: { cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30', icon: Shield },
        none: { cls: 'bg-red-500/15 text-red-300 border-red-500/30', icon: Shield },
    }[display.kind] || { cls: 'bg-white/10 text-gray-300 border-white/15', icon: Shield };
    const Icon = cfg.icon;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${cfg.cls}`}>
            <Icon size={12} className="shrink-0" />
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide leading-none">{display.label}</p>
                <p className="text-[10px] opacity-90 mt-0.5 leading-snug">{display.text}</p>
            </div>
        </div>
    );
};

const InfoChip = ({ icon: Icon, label, value }) => {
    if (!value) return null;
    return (
        <div className="flex items-start gap-1.5 min-w-0">
            <Icon size={11} className="text-gray-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
                <p className="text-[8px] font-bold uppercase tracking-wider text-gray-500 leading-none">{label}</p>
                <p className="text-xs text-white break-words mt-0.5 leading-snug">{value}</p>
            </div>
        </div>
    );
};

const SectionCard = ({ title, badge, children, className = '' }) => (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 ${className}`}>
        {(title || badge) && (
            <div className="flex items-center justify-between gap-2 mb-2">
                {title && (
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{title}</p>
                )}
                {badge}
            </div>
        )}
        {children}
    </div>
);

const AdminPlayerProfileModal = ({
    registration,
    initialProfile = null,
    eventId = null,
    eventRegistrations = [],
    payments = [],
    onClose,
    onLinkProfile,
}) => {
    const [player, setPlayer] = useState(initialProfile);
    const [loading, setLoading] = useState(!!registration);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!registration) return undefined;

        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const email = (registration.email || '').trim();
                let query = supabase
                    .from('players')
                    .select(`
                        id, name, email, contact_number, image_url, points, rank_label,
                        category, level, age_group, gender, region, home_club, nationality,
                        license_type, paid_registration, rankedin_id, bio, approved, account_type,
                        temporary_licenses(id, event_id, event_date, created_at)
                    `);

                if (initialProfile?.id) {
                    query = query.eq('id', initialProfile.id);
                } else if (email) {
                    query = query.ilike('email', email);
                } else {
                    setPlayer(null);
                    setLoading(false);
                    return;
                }

                const { data, error: fetchError } = await query.maybeSingle();
                if (fetchError) throw fetchError;
                if (!cancelled) setPlayer(data || null);
            } catch (err) {
                if (!cancelled) {
                    setError(err.message || 'Failed to load profile');
                    setPlayer(initialProfile || null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [registration, initialProfile]);

    const displayName = player?.name || registration?.full_name || 'Player';
    const email = (player?.email || registration?.email || '').toLowerCase();

    const licenseDisplay = useMemo(() => (
        resolveRegistrationLicenseDisplay(email, eventId, player, payments)
    ), [email, eventId, player, payments]);

    const playerEventEntries = useMemo(() => {
        const targetEmail = email;
        if (!targetEmail) return registration ? [registration] : [];
        const matches = (eventRegistrations || []).filter(
            (reg) => (reg.email || '').toLowerCase() === targetEmail,
        );
        if (matches.length > 0) {
            return [...matches].sort((a, b) => (a.division || '').localeCompare(b.division || ''));
        }
        return registration ? [registration] : [];
    }, [email, eventRegistrations, registration]);

    const entryCount = playerEventEntries.length;
    const hasLinkedProfile = !!player?.id;

    return (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-3 bg-black/70 backdrop-blur-[2px]" onClick={onClose}>
            <div
                className="bg-[#141414] border border-white/10 rounded-t-2xl sm:rounded-xl w-full max-w-lg md:max-w-3xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/50"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative shrink-0 overflow-hidden rounded-t-2xl sm:rounded-t-xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-padel-green/15 via-[#1a1a1a] to-[#141414]" />
                    <div className="relative px-4 py-3 border-b border-white/10 flex items-center gap-3 pr-12">
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/20 bg-black/40 shrink-0">
                            {player?.image_url ? (
                                <img src={player.image_url} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <User className="w-5 h-5 text-gray-500" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-padel-green/80 mb-0.5">4M Profile</p>
                            <h3 className="text-lg font-black text-white leading-tight truncate">{displayName}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {hasLinkedProfile && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        <CheckCircle size={9} />
                                        Linked
                                    </span>
                                )}
                                {player?.points > 0 && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase bg-padel-green/20 text-padel-green border border-padel-green/30">
                                        <Trophy size={9} />
                                        {Number(player.points).toLocaleString()} pts
                                    </span>
                                )}
                                {player?.rank_label && player.rank_label !== 'Unranked' && (
                                    <span className="text-[9px] font-semibold text-gray-400">{player.rank_label}</span>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/30 text-gray-300 hover:text-white hover:bg-black/50 transition-colors"
                            aria-label="Close"
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 min-h-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 size={22} className="animate-spin text-gray-500" />
                        </div>
                    ) : (
                        <>
                            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                                <div className="space-y-3 min-w-0">
                                    {!hasLinkedProfile && (
                                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                                            <p className="text-xs text-amber-100 font-semibold">No linked 4M profile</p>
                                            <p className="text-[10px] text-amber-200/70 mt-0.5 truncate">
                                                {registration?.email || '—'}
                                            </p>
                                            {onLinkProfile && (
                                                <button
                                                    type="button"
                                                    onClick={() => onLinkProfile(registration)}
                                                    className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-400 text-black hover:opacity-90"
                                                >
                                                    <Link2 size={11} />
                                                    Link profile
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <SectionCard title="Contact">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2.5 mb-2.5">
                                            <InfoChip icon={Mail} label="Email" value={player?.email || registration?.email} />
                                            <InfoChip icon={Phone} label="Phone" value={player?.contact_number || registration?.phone} />
                                        </div>
                                        <LicenseBadge display={licenseDisplay} />
                                    </SectionCard>

                                    <SectionCard title="Player details">
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                            <InfoChip icon={Users} label="Category" value={player?.category} />
                                            <InfoChip icon={User} label="Gender" value={player?.gender} />
                                            <InfoChip icon={MapPin} label="Region" value={player?.region} />
                                            <InfoChip icon={MapPin} label="Club" value={player?.home_club} />
                                            <InfoChip icon={MapPin} label="Nationality" value={player?.nationality} />
                                            <InfoChip icon={CreditCard} label="Rankedin" value={player?.rankedin_id} />
                                            {player?.level && <InfoChip icon={Trophy} label="Level" value={player.level} />}
                                            {player?.age_group && <InfoChip icon={Calendar} label="Age" value={player.age_group} />}
                                        </div>
                                    </SectionCard>

                                    {player?.bio?.trim() && (
                                        <SectionCard title="Bio">
                                            <p className="text-xs text-gray-300 whitespace-pre-wrap leading-snug line-clamp-4">{player.bio}</p>
                                        </SectionCard>
                                    )}
                                </div>

                                <SectionCard
                                    title="Event entries"
                                    badge={(
                                        <span className="text-[9px] font-bold text-padel-green bg-padel-green/10 px-1.5 py-0.5 rounded-full">
                                            {entryCount}
                                        </span>
                                    )}
                                    className="md:sticky md:top-0"
                                >
                                    <div className="space-y-1.5 max-h-[min(320px,42vh)] md:max-h-none overflow-y-auto md:overflow-visible">
                                        {playerEventEntries.map((entry) => {
                                            const pay = fmtPayment(entry.payment_status);
                                            const withdrawn = String(entry.status || '').toLowerCase() === 'withdrawn';
                                            return (
                                                <div
                                                    key={entry.id}
                                                    className={`rounded-lg border px-2.5 py-2 ${
                                                        entry.id === registration?.id
                                                            ? 'border-padel-green/40 bg-padel-green/5'
                                                            : 'border-white/10 bg-black/20'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-white truncate">{entry.division}</p>
                                                            {entry.id === registration?.id && (
                                                                <p className="text-[8px] font-bold uppercase text-padel-green/80">Current row</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase border ${pay.cls}`}>
                                                                {pay.label}
                                                            </span>
                                                            {withdrawn && (
                                                                <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase bg-gray-500/15 text-gray-400 border border-gray-500/25">
                                                                    Out
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {(entry.partner_name || entry.partner_email) && (
                                                        <p className="text-[10px] text-gray-400 mt-1 truncate">
                                                            {entry.partner_name || '—'}
                                                            {entry.partner_email && (
                                                                <span className="text-gray-500"> · {entry.partner_email}</span>
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </SectionCard>
                            </div>
                        </>
                    )}
                </div>

                {!loading && (
                    <div className="shrink-0 border-t border-white/10 bg-[#141414] px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex flex-col sm:flex-row gap-2">
                        {hasLinkedProfile && (
                            <a
                                href={`/players?id=${player.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-black bg-padel-green !text-black hover:!text-black hover:brightness-110 transition-all [&_svg]:!text-black"
                            >
                                <ExternalLink size={13} className="shrink-0" />
                                View public profile
                            </a>
                        )}
                        {onLinkProfile && hasLinkedProfile && (
                            <button
                                type="button"
                                onClick={() => onLinkProfile(registration)}
                                className="inline-flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-bold border border-white/15 text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <Link2 size={13} />
                                Change link
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPlayerProfileModal;
