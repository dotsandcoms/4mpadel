import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

/** Website is the share destination; event navigation stays native. */
export const SITE_ORIGIN = 'https://4mpadel.co.za';

export function siteUrl(path: string) {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalised}`;
}

export async function openSitePath(path: string, options?: { forceBrowser?: boolean }) {
  const payMatch = /^\/events\/register\?id=(\d+)&mode=pay$/.exec(path);
  if (payMatch && !options?.forceBrowser) {
    router.push({ pathname: '/events/register', params: { id: payMatch[1], mode: 'pay' } });
    return;
  }
  const match = /^\/calendar\/([^/?#]+)(?:[?#].*)?$/.exec(path);
  if (match && !options?.forceBrowser) {
    router.push({ pathname: '/events/[id]', params: { id: decodeURIComponent(match[1]) } });
    return;
  }
  await WebBrowser.openBrowserAsync(siteUrl(path), {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    controlsColor: '#CCFF00',
  });
}
