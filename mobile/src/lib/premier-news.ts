import { DomUtils, parseDocument } from 'htmlparser2';

const api = 'https://api-prod.premierpadel.com/api/news';
const media = 'https://cdn.premierpadel.com';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export type PremierArticle = { slug: string; title: string; publishedAt: string | null; image: string | null };
export type PremierParagraph = { style: 'body' | 'heading'; text: string };
export type PremierStory = PremierArticle & { paragraphs: PremierParagraph[] };
export type PremierNewsPage = { articles: PremierArticle[]; nextPage: number | null };

export function isPremierNewsSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z\d-]{1,200}$/.test(value);
}

export function premierNewsDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(value));
}

function publisherImage(value: unknown) {
  const source = text(value);
  if (!source) return null;
  try {
    const url = new URL(source, media);
    return url.origin === media && !url.username && !url.password && url.pathname.startsWith('/uploads/') ? url.href : null;
  } catch {
    return null;
  }
}

function article(value: unknown, thumbnail = true): PremierArticle | null {
  if (!object(value) || !isPremierNewsSlug(value.slug) || typeof value.title !== 'string' || !value.title.trim()) return null;
  const publishedAt = text(value.published_at);
  const image = publisherImage(value.hero_image_url), preview = publisherImage(value.hero_media_thumbnail);
  return { slug: value.slug, title: value.title.trim(), publishedAt: Number.isFinite(Date.parse(publishedAt)) ? publishedAt : null,
    image: thumbnail ? preview || image : image || preview };
}

export function parsePremierNews(payload: unknown, page: number): PremierNewsPage {
  if (!object(payload) || payload.status !== true || !Array.isArray(payload.data)) throw new Error('Premier Padel news is unavailable');
  const articles = new Map<string, PremierArticle>();
  for (const row of payload.data) {
    const item = article(row);
    if (item && !articles.has(item.slug)) articles.set(item.slug, item);
  }
  return { articles: [...articles.values()], nextPage: Number(payload.totalPages) > page ? page + 1 : null };
}

type HtmlNode = ReturnType<typeof parseDocument>['children'][number];
const storyTags = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'li', 'blockquote']);

function storyParagraphs(nodes: HtmlNode[]): PremierParagraph[] {
  return nodes.flatMap(node => {
    if (!('attribs' in node)) return [];
    if (node.name === 'script' || node.name === 'style' || node.name === 'noscript') return [];
    if (!storyTags.has(node.name)) return storyParagraphs(node.children);
    const content = DomUtils.innerText(node).replace(/[^\S\n]+/g, ' ').trim();
    if (!content) return [];
    return [{ style: /^h[2-5]$/.test(node.name) ? 'heading' : 'body', text: node.name === 'li' ? `• ${content}` : content }];
  });
}

export function parsePremierStory(payload: unknown, slug: string): PremierStory {
  if (!object(payload) || payload.status !== true || !object(payload.data) || payload.data.status !== 'published') throw new Error('This story is unavailable');
  const story = article(payload.data, false);
  if (!story || story.slug !== slug) throw new Error('This story is unavailable');
  const blocks = Array.isArray(payload.data.blocks) ? payload.data.blocks.filter(object) : [];
  const paragraphs = blocks.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)).flatMap(block => {
    if (block.block_type !== 'text' || !object(block.content) || block.content.is_active === false) return [];
    return storyParagraphs(parseDocument(text(block.content.text)).children);
  });
  const description = text(payload.data.description);
  if (!paragraphs.length && description) {
    const fallback = DomUtils.innerText(parseDocument(description)).trim();
    if (fallback) paragraphs.push({ style: 'body', text: fallback });
  }
  return { ...story, paragraphs };
}

async function fetchNewsData(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${api}/${path}`, { signal: controller.signal, credentials: 'omit',
      headers: { Accept: 'application/json', 'Accept-Language': 'en' } });
    if (!response.ok) throw new Error('Premier Padel news is unavailable');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPremierNews(page = 1, limit = 6): Promise<PremierNewsPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit), type: 'all', slug: 'news', order_by: 'newest' });
  return parsePremierNews(await fetchNewsData(`getNews?${query}`), page);
}

export async function fetchPremierStory(slug: string): Promise<PremierStory> {
  if (!isPremierNewsSlug(slug)) throw new Error('This story is unavailable');
  return parsePremierStory(await fetchNewsData(`getNewsDetails/${slug}`), slug);
}
