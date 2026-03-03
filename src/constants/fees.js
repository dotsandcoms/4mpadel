/**
 * Centralized fee configuration for 4M Padel platform.
 * Amounts are stored in Rands (ZAR).
 */
export const FEES = {
    FULL_LICENSE: 450,
    TEMPORARY_LICENSE: 120,
};

/**
 * Helper to convert Rand amount to Paystack subunits (cents).
 * @param {number} amountInRands 
 * @returns {number}
 */
export const toPaystackAmount = (amountInRands) => Math.round(amountInRands * 100);

/**
 * Formats a Rand amount for display.
 * @param {number} amount 
 * @returns {string}
 */
export const formatCurrency = (amount) => `R${amount.toFixed(2)}`;
