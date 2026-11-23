import { type ReactElement, type ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';
import { scrubSentryEvent } from './telemetry-privacy';

let enabled = false;

export function initializeSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (enabled || !dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.EXPO_PUBLIC_TELEMETRY_ENV || (__DEV__ ? 'development' : 'production'),
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      beforeBreadcrumb: () => null,
      beforeSend: scrubSentryEvent,
    });
    enabled = true;
  } catch { /* Monitoring configuration must not prevent the app from opening. */ }
}

export function reportNativeError(error: Error, flow: string) {
  if (!enabled) return;
  try { Sentry.captureException(error, { tags: { flow } }); } catch { /* Keep the original recovery path. */ }
}

export function SentryBoundary({ children, fallback }: {
  children: ReactNode;
  fallback: (props: { resetError: () => void }) => ReactElement;
}) {
  return enabled ? <Sentry.ErrorBoundary fallback={fallback}>{children}</Sentry.ErrorBoundary> : children;
}
