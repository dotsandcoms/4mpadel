import React from 'react';

const fields = [
    ['Bank', 'bank_name'],
    ['Account holder', 'account_holder'],
    ['Account number', 'account_number'],
    ['Branch code', 'branch_code'],
    ['Account type', 'account_type'],
];

export default function RevealedBankingDetails({ details, onHide }) {
    return <div className="rounded-xl border border-padel-green/25 p-4 bg-black/40 space-y-2" data-private="true">
        <div className="flex justify-between gap-3">
            <p className="text-xs text-gray-400">Confidential · hides after 60 seconds</p>
            <button type="button" onClick={onHide} className="text-xs text-padel-green focus-visible:outline-2 focus-visible:outline-padel-green">Hide now</button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {fields.map(([label, key]) => <div key={key}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="text-white break-all mt-0.5">{details[key]}</dd>
            </div>)}
        </dl>
    </div>;
}
