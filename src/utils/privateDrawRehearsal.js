export const REHEARSAL_TESTER_EMAIL = 'greggogoski@gmail.com';

export function canSeePrivateRehearsal(email, permissions) {
    return permissions?.role === 'super_admin'
        || (String(email || '').trim().toLowerCase() === REHEARSAL_TESTER_EMAIL
            && permissions?.role === 'private_rehearsal');
}

export function rehearsalStorageKey(userId, eventId) {
    return `4m-private-draw-rehearsal-v1:${userId}:${eventId}`;
}
