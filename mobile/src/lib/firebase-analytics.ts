/** Web previews do not send mobile Analytics events. Metro selects .native.ts on phones. */
export async function configureAnalytics(): Promise<void> {}
export async function sendAnalyticsEvent(_name: string, _params: Record<string, unknown>): Promise<void> {}
export async function sendAnalyticsScreen(_name: string): Promise<void> {}
export async function identifyAnalyticsUser(_id: string | null): Promise<void> {}
export async function resetAnalytics(): Promise<void> {}
