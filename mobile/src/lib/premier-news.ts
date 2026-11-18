import { DomUtils, parseDocument } from 'htmlparser2';

const publisher = 'https://premierpadel.com';
export const premierNewsIndex = `${publisher}/en/news`;

export type PremierArticle = { url: string; title: string; date: string | null; image: string | null };

export function isPremierNewsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === publisher && !url.username && !url.password && /^\/en\/news(?:\/[a-z\d-]+)?\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function previewImage(source?: string) {
  if (!source) return null;
  try {
    const image = new URL(source, publisher);
    if (image.origin === 'https://cdn.premierpadel.com') return image.href;
    if (image.origin !== publisher || image.pathname !== '/_next/image') return null;
    const original = new URL(image.searchParams.get('url') ?? '');
    if (original.origin !== 'https://cdn.premierpadel.com') return null;
    image.searchParams.set('w', '640');
    return image.href;
  } catch {
    return null;
  }
}

export function parsePremierNews(html: string): PremierArticle[] {
  const document = parseDocument(html);
  const links = DomUtils.findAll(
    element => element.name === 'a' && /^\/en\/news\/[a-z\d-]+\/?$/i.test(element.attribs.href ?? ''),
    document.children,
  );
  const articles = new Map<string, PremierArticle>();
  for (const link of links) {
    const heading = DomUtils.findOne(element => /^h[2-4]$/.test(element.name), link.children);
    const title = heading ? DomUtils.textContent(heading).trim() : '';
    const url = `${publisher}${link.attribs.href.replace(/\/$/, '')}`;
    if (!title || articles.has(url)) continue;
    const date = DomUtils.findOne(element => element.name === 'time' || element.name === 'p', link.children);
    const image = DomUtils.findOne(element => element.name === 'img', link.children);
    articles.set(url, { url, title, date: date ? DomUtils.textContent(date).trim() || null : null, image: previewImage(image?.attribs.src) });
    if (articles.size >= 6) break;
  }
  return [...articles.values()];
}

export async function fetchPremierNews() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // The English home page server-renders the official news cards.
    const response = await fetch(`${publisher}/en`, { signal: controller.signal, headers: { Accept: 'text/html' }, credentials: 'omit' });
    if (!response.ok) throw new Error('Premier Padel news is unavailable');
    const articles = parsePremierNews(await response.text());
    if (!articles.length) throw new Error('No Premier Padel headlines found');
    return articles;
  } finally {
    clearTimeout(timeout);
  }
}
