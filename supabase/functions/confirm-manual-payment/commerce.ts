/**
 * Platform commerce config for edge functions.
 * Keep copies in sync with src/utils/commerce.js math (Rands, 2dp).
 */
export const COMMERCE_DEFAULTS = {
    full_license_enabled: true,
    full_license_price: 450,
    temp_license_enabled: true,
    temp_license_price: 120,
    license_fee_percent: 0,
    event_fee_percent: 0,
    fee_label: 'Management fee',
};

export function roundMoney(amount: number): number {
    return Math.round((Number(amount) || 0) * 100) / 100;
}

export function applyPercentFee(baseAmount: number, percent: number) {
    const base = roundMoney(baseAmount);
    const pct = Math.min(100, Math.max(0, Number(percent) || 0));
    const fee = pct > 0 ? roundMoney(base * (pct / 100)) : 0;
    return { base, percent: pct, fee, total: roundMoney(base + fee) };
}

export function normalizeCommerce(row: Record<string, unknown> | null | undefined) {
    const src = row || {};
    const feeLabel = String(src.fee_label || '').trim();
    return {
        full_license_enabled: src.full_license_enabled !== false,
        full_license_price: Math.max(0, Number(src.full_license_price ?? COMMERCE_DEFAULTS.full_license_price)),
        temp_license_enabled: src.temp_license_enabled !== false,
        temp_license_price: Math.max(0, Number(src.temp_license_price ?? COMMERCE_DEFAULTS.temp_license_price)),
        license_fee_percent: Math.min(100, Math.max(0, Number(src.license_fee_percent ?? 0))),
        event_fee_percent: Math.min(100, Math.max(0, Number(src.event_fee_percent ?? 0))),
        fee_label: feeLabel || COMMERCE_DEFAULTS.fee_label,
    };
}

export function licenseQuote(type: string, config: Record<string, unknown>) {
    const commerce = normalizeCommerce(config);
    const isFull = String(type || '').toLowerCase() === 'full';
    const price = isFull ? commerce.full_license_price : commerce.temp_license_price;
    return {
        type: isFull ? 'full' : 'temporary',
        enabled: isFull ? commerce.full_license_enabled : commerce.temp_license_enabled,
        feeLabel: commerce.fee_label,
        ...applyPercentFee(price, commerce.license_fee_percent),
    };
}

export async function fetchCommerceConfig(supabaseAdmin: { from: (table: string) => any }) {
    const { data, error } = await supabaseAdmin
        .from('commerce_config')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
    if (error) {
        console.error('fetchCommerceConfig failed, using defaults', error);
        return normalizeCommerce(null);
    }
    return normalizeCommerce(data);
}

export function knownLicenseTotals(config: Record<string, unknown>) {
    const full = licenseQuote('full', config).total;
    const temp = licenseQuote('temporary', config).total;
    return {
        full: Array.from(new Set([full, COMMERCE_DEFAULTS.full_license_price].map(roundMoney))),
        temp: Array.from(new Set([temp, COMMERCE_DEFAULTS.temp_license_price].map(roundMoney))),
    };
}

export function matchLicenseTypeByAmount(amount: number, config: Record<string, unknown>) {
    const n = roundMoney(amount);
    const known = knownLicenseTotals(config);
    if (known.temp.includes(n)) return 'temporary';
    if (known.full.includes(n)) return 'full';
    return null;
}
