import { type ComponentType, type ReactElement, type ReactNode } from 'react';

export function initializeSentry() {}
export function registerSentryNavigation(_ref: unknown) {}
export function wrapSentryRoot(Component: ComponentType) { return Component; }
export function reportNativeError(_error: Error, _flow: string) {}
export function SentryBoundary({ children }: {
  children: ReactNode;
  fallback: (props: { resetError: () => void }) => ReactElement;
}) { return children; }
