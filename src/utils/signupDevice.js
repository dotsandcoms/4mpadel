/**
 * Browser snapshot at signup. No cookies or advertising IDs — enough to
 * tell iPhone Safari from desktop Chrome when signup_source is web.
 */
export function collectWebSignupDevice() {
    const ua = String(navigator.userAgent || '').slice(0, 180);
    return {
        source: 'web',
        brand: null,
        manufacturer: null,
        model: null,
        modelId: null,
        osName: guessOsName(ua),
        osVersion: null,
        deviceType: /Mobile|Android|iPhone|iPad/i.test(ua) ? 'phone' : 'desktop',
        isDevice: true,
        appVersion: null,
        build: null,
        userAgent: ua,
        language: navigator.language || null,
        recordedAt: new Date().toISOString(),
    };
}

function guessOsName(ua) {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Mac OS X/i.test(ua)) return 'macOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    return null;
}
