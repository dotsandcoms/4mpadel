import React from 'react';
import { Check, User, UserPlus } from 'lucide-react';

const PaymentBadge = ({ paid, label }) => (
    <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
            paid
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}
    >
        {paid && <Check size={10} strokeWidth={2.5} className="shrink-0" />}
        {label}
    </span>
);

const PersonCell = ({ role, name, paid, label }) => (
    <div className="flex items-start gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0">
            <User size={13} className="text-slate-500" />
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none mb-0.5">
                {role}
            </p>
            <p className="text-sm font-medium text-slate-900 truncate leading-tight">{name}</p>
            <div className="mt-1">
                <PaymentBadge paid={paid} label={label} />
            </div>
        </div>
    </div>
);

/**
 * @param {object} props
 * @param {object} props.entry — registrationEntries item
 * @param {string} props.playerName — display name for the registrant
 * @param {'panel'|'banner'} [props.variant]
 * @param {string} [props.accent]
 * @param {string} [props.btnTextColor]
 * @param {() => void} [props.onAddPartner]
 * @param {() => void} [props.onPay]
 * @param {() => void} [props.onWithdraw]
 * @param {() => void} [props.onRemovePartner]
 * @param {string} [props.withdrawLabel]
 * @param {boolean} [props.showActions]
 */
const ManualRegistrationEntryCard = ({
    entry,
    playerName = 'You',
    variant = 'panel',
    accent = '#CCFF00',
    btnTextColor = '#0F172A',
    onAddPartner,
    onPay,
    onWithdraw,
    onRemovePartner,
    withdrawLabel = 'Withdraw',
    showActions = false,
}) => {
    const shellClass = variant === 'banner'
        ? 'rounded-xl border border-white/80 bg-white shadow-sm shadow-green-900/5'
        : 'rounded-xl border border-slate-200/80 bg-slate-50/50';

    const playerPaid = entry.isPaid;
    const playerLabel = playerPaid ? 'Paid & Confirmed' : 'Payment Pending';
    const partnerPaid = entry.partnerPaid;
    const partnerLabel = entry.partnerPaymentLabel || (partnerPaid ? 'Paid & Confirmed' : 'Payment Pending');

    return (
        <div className={`${shellClass} p-3.5 sm:p-4`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none mb-1">
                        Division
                    </p>
                    <p className="text-sm font-semibold text-slate-900 leading-snug">{entry.division}</p>
                    {entry.wasAddedByPartner && entry.addedByName && (
                        <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                            Added by {entry.addedByName}
                        </p>
                    )}
                </div>
                {showActions && onWithdraw && (
                    <button
                        type="button"
                        onClick={onWithdraw}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors shrink-0"
                    >
                        {withdrawLabel}
                    </button>
                )}
            </div>

            <div className="my-2.5 border-t border-slate-200/70" />

            <div className={`flex gap-3 ${entry.hasPartner || entry.canAddPartner ? '' : 'flex-col'}`}>
                <div className={entry.hasPartner || entry.canAddPartner ? 'flex-1 min-w-0' : 'w-full'}>
                    <PersonCell role="Player" name={playerName} paid={playerPaid} label={playerLabel} />
                </div>

                {entry.hasPartner ? (
                    <div className="flex-1 min-w-0">
                        <PersonCell
                            role="Partner"
                            name={entry.partnerName}
                            paid={partnerPaid}
                            label={partnerLabel}
                        />
                        {showActions && onRemovePartner && entry.isBookingOwner && entry.canWithdraw && (
                            <button
                                type="button"
                                onClick={onRemovePartner}
                                className="mt-1.5 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline"
                            >
                                Remove partner
                            </button>
                        )}
                    </div>
                ) : entry.canAddPartner ? (
                    <div className="flex-1 min-w-0 flex items-center">
                        <button
                            type="button"
                            onClick={onAddPartner}
                            className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg border border-dashed border-slate-300 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors"
                        >
                            <UserPlus size={14} className="shrink-0" style={{ color: accent }} />
                            Add Partner
                        </button>
                    </div>
                ) : null}
            </div>

            {showActions && onPay && (
                <>
                    <div className="my-3 border-t border-slate-200/70" />
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={onPay}
                            className="text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-opacity hover:opacity-90"
                            style={{ backgroundColor: accent, color: btnTextColor }}
                        >
                            Pay
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default ManualRegistrationEntryCard;
