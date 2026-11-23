import { type ReactElement, type ReactNode } from 'react';

export function initializeSentry() {}
export function reportNativeError(_error: Error, _flow: string) {}
export function SentryBoundary({ children }: {
  children: ReactNode;
  fallback: (props: { resetError: () => void }) => ReactElement;
}) { return children; }
