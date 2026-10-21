import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { PlayerPortrait } from './ProPlayerModal';
import CountryLabel from './CountryLabel';
import PlayerDirectorySelect from './PlayerDirectorySelect';
import PlayerCareer from './PlayerCareer';
import ComparisonHistory from './ComparisonHistory';
import { RankChange } from './RankingMovement';
import { playerInsights } from '../../utils/proPlayerInsights';
import { comparisonPlayers } from '../../utils/proComparison';
import { formatNumber, formatDate } from '../../utils/proPadelView';

export default function PlayerComparison({ players, firstId, secondId, onChange, tourState, playerHref, playerLookup, onRetry, onSelectPlayer, selectionLoading, selectionError, onRetrySelection }) {
  const [message, setMessage] = useState('');
  const [first, second] = comparisonPlayers(players, firstId, secondId);
  if (selectionLoading) return <div className="pro-state" role="status">Loading selected players from the full directory…</div>;
  if (selectionError) return <div className="pro-state" role="alert"><p>{selectionError}</p><button className="pro-button" onClick={onRetrySelection}>Retry players</button></div>;
  if (!first || !second) return <div className="pro-empty"><h3>Not enough players to compare</h3><p>Try again after the next ranking update.</p></div>;
  const pair = [first, second];
  const stats = pair.map((player) => playerInsights(tourState.snapshot?.matches || [], player.id));
  const rows = [
    ['World ranking', (player) => <>{player.rank ? `#${player.rank}` : 'Unranked'} <RankChange value={player.rankChange} /></>],
    ['Ranking points', (player) => formatNumber(player.points)],
    ['Playing side', (player) => ({ drive: 'Right side', backhand: 'Left side' })[player.side] || 'Not available'],
    ['Playing hand', (player) => ({ left: 'Left-handed', right: 'Right-handed' })[player.hand] || 'Not available'],
    ['Height', (player) => player.height ? `${player.height} cm` : 'Not available'],
  ];
  const share = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('compare', first.id); url.searchParams.set('against', second.id);
    try { await navigator.clipboard.writeText(url.href); setMessage('Comparison link copied'); }
    catch { setMessage('Copy this page’s address to share the comparison.'); }
  };
  return <section className="pro-comparison" aria-label="Player comparison">
    <div className="pro-section-title"><div><p className="pro-eyebrow">SIDE BY SIDE</p><h2>Compare players</h2></div><button className="pro-text-button" onClick={share}><Share2 size={16} /> Share</button></div>
    {message && <p role="status" className="pro-coverage">{message}</p>}
    <p className="pro-coverage">Choose two {first.category === 'men' ? 'men' : 'women'} from the full player directory. Use the Men / Women switch above to change category.</p>
    <div className="pro-compare-pickers">{pair.map((player, index) => <div className="pro-compare-picker" key={`${first.category}-${index}`}><span>{index === 0 ? 'First player' : 'Second player'}</span><PlayerDirectorySelect
      label={index === 0 ? 'First comparison player' : 'Second comparison player'}
      category={first.category} player={player} excludeId={pair[1-index].id}
      onSelect={option => { onSelectPlayer(option); setMessage(''); onChange(index === 0 ? option.id : first.id, index === 1 ? option.id : second.id); }}
    /></div>)}</div>
    <div className="pro-compare-portraits">{pair.map((player) => <Link key={player.id} to={playerHref(player.id)} state={{ proModal: true }} aria-haspopup="dialog" className="pro-compare-player"><PlayerPortrait player={player} className="pro-compare-photo" /><div><span>{player.rank ? `WORLD #${player.rank}` : 'PRO PLAYER'}</span><h3>{player.name}</h3><CountryLabel code={player.nationality} /></div></Link>)}</div>
    <div className="pro-compare-table-wrap"><table className="pro-compare-table"><caption className="sr-only">Player details comparison</caption><thead><tr><th scope="col">Player details</th>{pair.map((player) => <th scope="col" key={player.id}>{player.name}</th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{pair.map((player) => <td key={player.id}>{value(player)}</td>)}</tr>)}</tbody></table></div>
    <p className="pro-coverage">Ranking edition where available: {formatDate(first.rankingDate)}{first.rankingDate !== second.rankingDate && ` / ${formatDate(second.rankingDate)}`}.</p>
    <div className="pro-compare-careers">{pair.map(player => <div key={player.id}><h3>{player.name}</h3><PlayerCareer player={player} /></div>)}</div>
    {tourState.loading ? <p role="status">Loading recent form…</p> : tourState.error ? <div role="alert"><p>{tourState.error}</p><button className="pro-button" onClick={onRetry}>Retry results</button></div> : <>
      <h3 className="pro-compare-heading">Recent form</h3><p className="pro-coverage">{tourState.snapshot?.coverage}. These selected-round figures are not season or career totals.</p>
      <div className="pro-compare-table-wrap"><table className="pro-compare-table"><caption className="sr-only">Form in covered rounds</caption><thead><tr><th scope="col">Covered rounds</th>{pair.map((player) => <th scope="col" key={player.id}>{player.name}</th>)}</tr></thead><tbody>
        <tr><th scope="row">Played</th>{stats.map((record,index) => <td key={index}>{record.played}</td>)}</tr>
        <tr><th scope="row">Wins / losses</th>{stats.map((record,index) => <td key={index}>{record.played ? `${record.wins} / ${record.losses}` : '—'}</td>)}</tr>
        <tr><th scope="row">Win rate</th>{stats.map((record,index) => <td key={index}>{record.winRate === null ? '—' : `${record.winRate}%`}</td>)}</tr>
        <tr><th scope="row">Form · newest first</th>{stats.map((record,index) => <td key={index}><div className="pro-compare-form">{record.form.length ? record.form.map((match) => <span key={match.id} className={match.result === 'W' ? 'change-up' : 'change-down'} aria-label={`${match.result === 'W' ? 'Win' : 'Loss'} at ${match.event}`}>{match.result}</span>) : 'No covered results'}</div></td>)}</tr>
      </tbody></table></div>

    </>}
    <ComparisonHistory key={`${first.id}-${second.id}`} first={first} second={second} playerLookup={playerLookup} playerHref={playerHref} />
  </section>;
}
