import React, { useState } from 'react';
import { Mail, Send, Check } from 'lucide-react';
import { toast } from 'sonner';
import { sendEmail } from '../utils/emails';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const PartnerProfileInvite = ({
    event,
    inviterName,
    inviterEmail,
    searchName,
    divisionName,
    compact = false,
}) => {
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSend = async (e) => {
        e?.preventDefault?.();
        const trimmed = email.trim();
        if (!isValidEmail(trimmed)) {
            toast.error('Please enter a valid email address');
            return;
        }
        if (inviterEmail && trimmed.toLowerCase() === inviterEmail.toLowerCase()) {
            toast.error('You cannot invite yourself');
            return;
        }

        setSending(true);
        const eventPath = event?.slug ? `/calendar/${event.slug}` : (event?.id ? `/calendar/${event.id}` : '/calendar');
        const eventUrl = `${window.location.origin}${eventPath}`;
        const profileUrl = `${window.location.origin}/`;

        const result = await sendEmail(trimmed, 'profile_invite', {
            inviterName: inviterName || 'A 4M Padel player',
            eventName: event?.event_name || 'a tournament',
            eventUrl,
            profileUrl,
            searchName: searchName?.trim() || '',
            division: divisionName || '',
        });
        setSending(false);

        if (result.success) {
            setSent(true);
            toast.success(`Invite sent to ${trimmed}`);
        } else {
            toast.error('Could not send invite. Please try again.');
        }
    };

    if (sent) {
        return (
            <div className={`${compact ? 'px-3 py-3' : 'px-4 py-3'} border-t border-gray-100`}>
                <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                    <Check size={14} className="shrink-0" />
                    Invite sent — they&apos;ll receive an email to create their 4M profile.
                </p>
            </div>
        );
    }

    return (
        <div className={`${compact ? 'px-3 py-3' : 'px-4 py-3'} border-t border-gray-100 space-y-2.5`}>
            <p className="text-xs text-slate-600 leading-snug">
                No matching players found{searchName ? ` for “${searchName}”` : ''}.
                Send an invite so they can create a free 4M Padel profile and register for this event.
            </p>
            <form onSubmit={handleSend} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                        type="email"
                        value={email}
                        onChange={(ev) => setEmail(ev.target.value)}
                        placeholder="Partner's email address"
                        className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 bg-white placeholder:text-slate-500 font-normal"
                    />
                </div>
                <button
                    type="submit"
                    disabled={sending || !email.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F172A] text-white disabled:opacity-50 shrink-0"
                >
                    {sending ? 'Sending…' : <><Send size={12} /> Send Invite</>}
                </button>
            </form>
        </div>
    );
};

export default PartnerProfileInvite;
