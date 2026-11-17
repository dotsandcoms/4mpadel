import { deferSharedLink, sharedLinkDestination } from '@/lib/shared-links';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const destination = sharedLinkDestination(path);
  if (!destination) return path;
  if (!initial) return destination;

  // Startup resolves onboarding and session eligibility before opening the link.
  deferSharedLink(destination);
  return '/';
}
