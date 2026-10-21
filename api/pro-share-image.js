import { loadShare } from '../server/pro-share.mjs';
import { renderShareImage } from '../server/pro-share-image.mjs';

export default async function handler(req, res) {
  try {
    const data = await loadShare(req.query.kind, req.query.id);
    if (!data) return res.status(404).send('Share image unavailable');
    const png = await renderShareImage(data);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(png);
  } catch { return res.status(503).send('Share image temporarily unavailable'); }
}
