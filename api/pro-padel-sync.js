/* global process */
import { createHash, timingSafeEqual } from 'node:crypto';
import { buildSnapshot, buildTourSnapshot, buildFixtureSnapshot, publishSnapshot } from '../server/pro-padel.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${secret}`;
  const digest = (value) => createHash('sha256').update(value).digest();
  if (!secret || typeof auth !== 'string' || !timingSafeEqual(digest(auth), digest(expected))) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const tour = req.query?.scope === 'tour';
    const fixtures = req.query?.scope === 'fixtures';
    const snapshot = await (fixtures ? buildFixtureSnapshot : tour ? buildTourSnapshot : buildSnapshot)({ token: process.env.PADEL_API_TOKEN });
    await publishSnapshot(snapshot, { url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, cachePath: fixtures ? 'fixtures-v1.json' : tour ? 'tour-v1.json' : 'rankings-v1.json' });
    return res.status(200).json({ updatedAt: snapshot.updatedAt });
  } catch {
    return res.status(502).json({ error: 'Refresh failed. The previous snapshot is still available.' });
  }
}
