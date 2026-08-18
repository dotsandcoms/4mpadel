/**
 * Platform commerce: license availability, prices, and optional % fees.
 * Amounts are Rands (ZAR). Checkout UIs and admin Settings share this module
 * so a price change in admin is the amount charged at registration and entry.
 */
import { supabase } from '../supabaseClient';
import { FEES } from '../constants/fees';

export const COMMERCE_DEFAULTS = {
    full_license_enabled: true,
    full_license_price: FEES.FULL_LICENSE,
    temp_license_enabled: true,
    temp_license_price: FEES.TEMPORARY_LICENSE,
    license_fee_percent: 0,
    event_fee_percent: 0,
    fee_label: 'Management fee',
};

export function roundMoney(amount) {
    return Math.round((Number(amount) || 0) * 100) / 100;
}

function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 't' || value === '1') return true;
    if (value === 'false' || value === 'f' || value === '0') return false;
    return fallback;
}

/**
 * Normalise a commerce_config row (or partial draft) onto COMMERCE_DEFAULTS.
 * @param {object|null|undefined} row
 */
export function normalizeCommerce(row) {
    const src = row || {};
    const feeLabel = String(src.fee_label || '').trim();
    return {
        full_license_enabled: toBoolean(src.full_license_enabled, COMMERCE_DEFAULTS.full_license_enabled),
        full_license_price: Math.max(0, toNumber(src.full_license_price, COMMERCE_DEFAULTS.full_license_price)),
        temp_license_enabled: toBoolean(src.temp_license_enabled, COMMERCE_DEFAULTS.temp_license_enabled),
        temp_license_price: Math.max(0, toNumber(src.temp_license_price, COMMERCE_DEFAULTS.temp_license_price)),
        license_fee_percent: Math.min(100, Math.max(0, toNumber(src.license_fee_percent, COMMERCE_DEFAULTS.license_fee_percent))),
        event_fee_percent: Math.min(100, Math.max(0, toNumber(src.event_fee_percent, COMMERCE_DEFAULTS.event_fee_percent))),
        fee_label: feeLabel || COMMERCE_DEFAULTS.fee_label,
        updated_at: src.updated_at || null,
        updated_by: src.updated_by || null,
    };
}

/**
 * Apply a percentage fee on top of a base amount.
 * @param {number} baseAmount
 * @param {number} percent
 */
export function applyPercentFee(baseAmount, percent) {
    const base = roundMoney(baseAmount);
    const pct = Math.min(100, Math.max(0, toNumber(percent, 0)));
    const fee = pct > 0 ? roundMoney(base * (pct / 100)) : 0;
    return {
        base,
        percent: pct,
        fee,
        total: roundMoney(base + fee),
    };
}

/**
 * @param {'full'|'temporary'|string} type
 * @param {object} config
 */
export function licenseQuote(type, config) {
    const commerce = normalizeCommerce(config);
    const isFull = String(type || '').toLowerCase() === 'full';
    const enabled = isFull ? commerce.full_license_enabled : commerce.temp_license_enabled;
    const price = isFull ? commerce.full_license_price : commerce.temp_license_price;
    return {
        type: isFull ? 'full' : 'temporary',
        enabled: !!enabled,
        feeLabel: commerce.fee_label,
        ...applyPercentFee(price, commerce.license_fee_percent),
    };
}

/**
 * Charge for a published event entry amount, with the event booking fee on top.
 * @param {number} entryFee
 * @param {object} config
 */
export function eventEntryQuote(entryFee, config) {
    const commerce = normalizeCommerce(config);
    return {
        feeLabel: commerce.fee_label,
        ...applyPercentFee(entryFee, commerce.event_fee_percent),
    };
}

/**
 * @param {object} config
 * @param {{ allowTemporary?: boolean, allowFull?: boolean }} [opts]
 * @returns {Array<'temporary'|'full'>}
 */
export function availableLicenseTypes(config, opts = {}) {
    const commerce = normalizeCommerce(config);
    const allowTemporary = opts.allowTemporary !== false;
    const allowFull = opts.allowFull !== false;
    const types = [];
    if (commerce.temp_license_enabled && allowTemporary) types.push('temporary');
    if (commerce.full_license_enabled && allowFull) types.push('full');
    return types;
}

/**
 * Keep the current choice if it is still on sale; otherwise the first available type.
 * @param {string|null} current
 * @param {object} config
 * @param {{ allowTemporary?: boolean, allowFull?: boolean }} [opts]
 * @returns {'full'|'temporary'|null}
 */
export function coerceLicenseChoice(current, config, opts = {}) {
    const types = availableLicenseTypes(config, opts);
    if (types.includes(current)) return current;
    return types[0] || null;
}

export function formatPercent(percent) {
    const n = toNumber(percent, 0);
    if (Number.isInteger(n)) return String(n);
    return String(roundMoney(n));
}

/**
 * Checkout caption, e.g. "R630.00 (R600.00 + 5% management fee)" or "R600.00".
 * @param {{ total: number, base: number, fee: number, percent: number, feeLabel?: string }} quote
 * @param {(n: number) => string} formatCurrency
 */
export function formatQuoteCaption(quote, formatCurrency) {
    if (!quote) return formatCurrency(0);
    if (quote.fee > 0) {
        const label = String(quote.feeLabel || 'fee').toLowerCase();
        return `${formatCurrency(quote.total)} (${formatCurrency(quote.base)} + ${formatPercent(quote.percent)}% ${label})`;
    }
    return formatCurrency(quote.total);
}

/**
 * Snapshot stored on payment metadata so historical charges keep the rates
 * that applied at checkout, even after admin later changes prices.
 */
export function commerceSnapshot(config) {
    const commerce = normalizeCommerce(config);
    return {
        full_license_enabled: commerce.full_license_enabled,
        full_license_price: commerce.full_license_price,
        temp_license_enabled: commerce.temp_license_enabled,
        temp_license_price: commerce.temp_license_price,
        license_fee_percent: commerce.license_fee_percent,
        event_fee_percent: commerce.event_fee_percent,
        fee_label: commerce.fee_label,
        captured_at: new Date().toISOString(),
    };
}

export async function fetchCommerceConfig(client = supabase) {
    const { data, error } = await client
        .from('commerce_config')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
    if (error) throw error;
    return normalizeCommerce(data);
}

/**
 * Known standalone license totals, including historical R450 / R120.
 * Used by webhook amount-fallback and admin Paystack sync.
 */
export function knownLicenseTotals(config) {
    const full = licenseQuote('full', config).total;
    const temp = licenseQuote('temporary', config).total;
    return {
        full: Array.from(new Set([full, FEES.FULL_LICENSE].map(roundMoney))),
        temp: Array.from(new Set([temp, FEES.TEMPORARY_LICENSE].map(roundMoney))),
    };
}

export function matchLicenseTypeByAmount(amount, config) {
    const n = roundMoney(amount);
    const known = knownLicenseTotals(config);
    if (known.temp.includes(n)) return 'temporary';
    if (known.full.includes(n)) return 'full';
    return null;
}
