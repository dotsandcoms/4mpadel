import React from 'react';
import { ArrowUp, ArrowDown, Minus, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatNumber } from '../../utils/proPadelView';

export function RankChange({ value }) {
  if (!Number.isSafeInteger(value)) return <span className="pro-rank-change change-unknown" aria-label="Ranking movement unavailable" title="Ranking movement unavailable">—</span>;
  const label = value > 0 ? `Up ${value} ${value === 1 ? 'place' : 'places'}` : value < 0 ? `Down ${Math.abs(value)} ${value === -1 ? 'place' : 'places'}` : 'No recorded ranking movement';
  return <span className={`pro-rank-change ${value > 0 ? 'change-up' : value < 0 ? 'change-down' : 'change-flat'}`} aria-label={label} title={`${label} since the previous ranking entry`}>
    {value > 0 ? <ArrowUp size={12} aria-hidden="true" /> : value < 0 ? <ArrowDown size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />}{value !== 0 && <span aria-hidden="true">{Math.abs(value)}</span>}
  </span>;
}

export function PointChange({ value }) {
  if (!Number.isFinite(value)) return null;
  return <span className={`pro-points-change ${value > 0 ? 'change-up' : value < 0 ? 'change-down' : 'change-flat'}`}>{value > 0 ? '+' : ''}{formatNumber(value)} pts</span>;
}

export default function RankingMovement({ follows, playerLookup, playerHref }) {
  const players = follows.map((row) => playerLookup[row.player_id]).filter(Boolean);
  const available = players.filter((player) => Number.isSafeInteger(player.rankChange) || Number.isFinite(player.pointsChange));
  const changed = available.filter((player) => player.rankChange || player.pointsChange).sort((a, b) => Math.abs(b.rankChange || 0) - Math.abs(a.rankChange || 0) || Math.abs(b.pointsChange || 0) - Math.abs(a.pointsChange || 0));
  return <section className="pro-ranking-updates" aria-label="Your players’ ranking updates"><h3><TrendingUp size={18} /> Ranking updates</h3><p className="pro-coverage">Changes from each player’s previous official ranking entry.</p>
    {changed.length ? <div className="pro-ranking-update-list">{changed.map((player) => <Link key={player.id} className="pro-ranking-update" to={playerHref(player.id)} state={{ proModal: true }} aria-haspopup="dialog"><div><strong>{player.name}</strong><small>Week of {formatDate(player.rankingDate)}</small></div><div><span>World #{player.rank} <RankChange value={player.rankChange} /></span><PointChange value={player.pointsChange} /></div></Link>)}</div> : <p className="pro-coverage">{available.length ? 'No changes reported for your followed players in this ranking update.' : 'Ranking changes are not available for your followed players in this edition yet.'}</p>}
    {players.length < follows.length && <p className="pro-coverage">Updates cover followed players in the current top 50 men and women.</p>}
  </section>;
}
