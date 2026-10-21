import React from 'react';
import { Check } from 'lucide-react';

// Shared by Event Manager and Tournament Manager; the caller resolves licence data.
export default function RegistrationLicenseBadge({ license }) {
    if (license.includes('Full')) {
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><Check size={10} /> Full license</span>;
    }
    if (license.includes('Temporary')) {
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20"><Check size={10} /> Temp license</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">No license</span>;
}
