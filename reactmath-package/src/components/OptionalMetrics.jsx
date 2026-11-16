import React, { lazy, Suspense } from 'react';

// Analytics is optional. A browser content blocker must not prevent the app
// from loading; keep the original analytics module and its requests blockable.
const Metrics = lazy(() => import('./GoogleAnalytics').catch(() => ({ default: () => null })));

export default function OptionalMetrics() {
    return <Suspense fallback={null}><Metrics /></Suspense>;
}
