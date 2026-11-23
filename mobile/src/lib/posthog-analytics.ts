// The Expo web target shares the site account system but sends no native telemetry.
export function initializePostHog() {}
export function capturePostHogEvent(_event: string, _properties?: Record<string, unknown>) {}
export function capturePostHogScreen(_name: string) {}
export async function identifyPostHogAccount(_id: string | null) {}
export function resetPostHogAccount() {}
