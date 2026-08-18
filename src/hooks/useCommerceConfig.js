import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    COMMERCE_DEFAULTS,
    availableLicenseTypes,
    fetchCommerceConfig,
    licenseQuote,
    normalizeCommerce,
} from '../utils/commerce';

/**
 * Live platform license prices and fee percents.
 * Falls back to COMMERCE_DEFAULTS if the table is unreachable (offline / pre-migration).
 */
export function useCommerceConfig() {
    const [config, setConfig] = useState(COMMERCE_DEFAULTS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const next = await fetchCommerceConfig();
            setConfig(next);
            setError(null);
            return next;
        } catch (err) {
            console.error('Failed to load commerce config', err);
            setError(err);
            setConfig((prev) => normalizeCommerce(prev));
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const full = useMemo(() => licenseQuote('full', config), [config]);
    const temp = useMemo(() => licenseQuote('temporary', config), [config]);

    return {
        config,
        loading,
        error,
        refresh,
        full,
        temp,
        licenseTypes: availableLicenseTypes(config),
        licenseSalesOpen: availableLicenseTypes(config).length > 0,
    };
}
