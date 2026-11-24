import { type ComponentType, type ReactElement, type ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import { scrubSentryEvent, scrubSentryTransaction } from './telemetry-privacy';

let enabled = false;
const navigation = Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: !isRunningInExpoGo() });

export function initializeSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (enabled || !dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.EXPO_PUBLIC_TELEMETRY_ENV || (__DEV__ ? 'development' : 'production'),
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      tracePropagationTargets: [],
      integrations: [navigation],
      enableNativeFramesTracking: !isRunningInExpoGo(),
      attachScreenshot: false,
      attachViewHierarchy: false,
      beforeBreadcrumb: () => null,
      beforeSend: scrubSentryEvent,
      beforeSendTransaction: event => {
        const name = event.transaction || '';
        // The router supplies route templates, without parameters. Drop URL-shaped names.
        const route = name === 'App Start' || /^[a-z()[\]/_-]+$/i.test(name) ? name : 'Other screen';
        return scrubSentryTransaction(event, route);
      },
    });
    enabled = true;
  } catch { /* Monitoring configuration must not prevent the app from opening. */ }
}

export function registerSentryNavigation(ref: Parameters<typeof navigation.registerNavigationContainer>[0]) {
  if (enabled) navigation.registerNavigationContainer(ref);
}

export function wrapSentryRoot(Component: ComponentType) {
  return enabled ? Sentry.wrap(Component) : Component;
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
