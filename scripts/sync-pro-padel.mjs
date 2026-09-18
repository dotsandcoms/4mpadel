import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { buildSnapshot, buildTourSnapshot, buildFixtureSnapshot, publishSnapshot } from '../server/pro-padel.mjs';

try {
  const config = {};
  for (const name of ['.env', '.env.local']) {
    try { Object.assign(config, parse(readFileSync(new URL(`../${name}`, import.meta.url)))); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read local configuration.'); }
  }
  Object.assign(config, process.env);
  const publish = process.argv.includes('--publish');
  const tour = process.argv.includes('--tour');
  const fixtures = process.argv.includes('--fixtures');
  console.log(fixtures ? 'Fetching the next event’s published fixtures (up to five paced requests).' : tour ? 'Fetching the tour calendar and recent final rounds (up to three paced requests).' : 'Fetching the top 50 men and women from Padel API (four paced requests).');
  const snapshot = await (fixtures ? buildFixtureSnapshot : tour ? buildTourSnapshot : buildSnapshot)({ token: config.PADEL_API_TOKEN });
  if (publish) {
    await publishSnapshot(snapshot, { url: config.SUPABASE_URL || config.VITE_SUPABASE_URL,
      serviceKey: config.SUPABASE_SERVICE_ROLE_KEY || config.VITE_SUPABASE_SERVICE_ROLE_KEY, cachePath: fixtures ? 'fixtures-v1.json' : tour ? 'tour-v1.json' : 'rankings-v1.json' });
    console.log('Published the complete Pro Padel snapshot to Supabase Storage.');
  } else {
    const path = fixtures ? '/tmp/4m-pro-fixtures-preview.json' : tour ? '/tmp/4m-pro-tour-preview.json' : '/tmp/4m-pro-padel-preview.json';
    writeFileSync(path, JSON.stringify(snapshot, null, 2));
    console.log(`Review snapshot saved to ${path}. No database or storage writes.`);
  }
  console.log(JSON.stringify(fixtures ? { event: snapshot.tournament?.name, matches: snapshot.matches.length, drawPublished: snapshot.drawPublished } : tour ? { tournaments: snapshot.tournaments.length, matches: snapshot.matches.length } : { updatedAt: snapshot.updatedAt, categories: Object.fromEntries(Object.entries(snapshot.categories).map(([key, value]) => [key, {
    players: value.players.length, profiles: value.players.filter((p) => p.detailsAvailable).length,
  }])) }));
} catch (error) {
  // Only our explicit errors are shown, never upstream bodies or credentials.
  console.error(error.message?.startsWith('Provider') || error.message?.startsWith('Could not') || error.message?.startsWith('Invalid provider') || error.message?.includes('not configured') ? error.message : 'Pro Padel sync failed. The previous snapshot has been preserved.');
  process.exitCode = 1;
}
