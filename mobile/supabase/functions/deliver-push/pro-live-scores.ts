import { getScore, hasScoreChanged } from '../_shared/pro-live-score.mjs';
import { credentialsAvailable, sendLiveScore, type ExpoPush, type ScorePin } from '../_shared/pro-live-score-push.ts';

type Database = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

export async function refreshPinnedScores(client: Database, providerFetch: typeof fetch, token: string | undefined, expo: ExpoPush) {
  if (!token) return;
  const command = async (p_action: string, p_data: object = {}) => {
    const result = await client.rpc('pro_live_score_admin', { p_action, p_data });
    if (result.error) throw new Error('Live score storage unavailable');
    return result.data;
  };
  const pins = (await command('claim')) as ScorePin[];
  const matches = new Map<number, ScorePin[]>();
  for (const pin of pins) {
    if (!credentialsAvailable(pin.platform)) continue;
    const group = matches.get(pin.match);
    if (group) group.push(pin);
    else matches.set(pin.match, [pin]);
  }

  const refresh = async ([match, group]: [number, ScorePin[]]) => {
    try {
      const score = await getScore(providerFetch, token, match);
      if (!score) return;
      for (let index = 0; index < group.length; index += 10) {
        await Promise.allSettled(group.slice(index, index + 10).map(async pin => {
          if (pin.lastScore && pin.lastScore.timestamp > score.timestamp) return;
          const changed = hasScoreChanged(score, pin.lastScore);
          if (!changed && (pin.lastScore?.timestamp === score.timestamp || Date.now() - Date.parse(pin.lastSentAt || '') < 110_000)) return;
          const lease = { pin: pin.pin, lease: pin.lease };
          if (!await command('current', lease)) return;
          const sent = await sendLiveScore(pin, score, expo);
          if (sent === 'invalid' || (sent === 'accepted' && score.status === 'final')) await command('finish', lease);
          else if (sent === 'accepted') await command('sent', { ...lease, score });
          else console.warn('An active Pro Padel score update will retry');
        }));
      }
    } catch {
      console.warn('A pinned Pro Padel match could not refresh');
    }
  };
  const groups = [...matches];
  for (let index = 0; index < groups.length; index += 4) {
    await Promise.all(groups.slice(index, index + 4).map(refresh));
  }
}
