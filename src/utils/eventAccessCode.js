export const generateAccessCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

export const getAccessCodeError = ({ enabled, code, protectedBefore = false }) => {
    if (!enabled) return '';
    const cleanCode = String(code || '').trim();
    if (!cleanCode && protectedBefore) return '';
    const length = Array.from(cleanCode).length;
    return length < 6 || length > 64 ? 'Use an access code of 6–64 characters.' : '';
};

export const saveEventAccessCode = async (client, eventId, options) => {
    const { enabled, code, protectedBefore = false } = options;
    const errorMessage = getAccessCodeError(options);
    if (errorMessage) throw new Error(errorMessage);
    const cleanCode = String(code || '').trim();
    if ((enabled && (!protectedBefore || cleanCode)) || (!enabled && protectedBefore)) {
        const { error } = await client.rpc('set_event_access_code', {
            p_event_id: eventId,
            p_enabled: enabled,
            p_code: enabled ? cleanCode : null,
        });
        if (error) throw error;
    }
    return enabled ? 'code' : 'public';
};
