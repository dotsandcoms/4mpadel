import * as WebBrowser from 'expo-web-browser';

/** Live website — used until native event-detail screens exist. */
export const SITE_ORIGIN = 'https://4mpadel.com';

export function siteUrl(path: string) {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalised}`;
}

export async function openSitePath(path: string) {
  await WebBrowser.openBrowserAsync(siteUrl(path), {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    controlsColor: '#CCFF00',
  });
}
