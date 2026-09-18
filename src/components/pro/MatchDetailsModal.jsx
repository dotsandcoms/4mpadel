import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Check, MapPin } from 'lucide-react';
import { MatchPlayer } from './ProMatchCards';
import CountryLabel from './CountryLabel';
import { formatDate, levelName } from '../../utils/proPadelView';

export default function MatchDetailsModal({ match, tournament, loading, error, updatedAt, playerLookup, playerHref, onClose, onRetry }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [shareMessage, setShareMessage] = useState('');
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);
  const share = async () => {
    const url = new URL('/pro/results', window.location.origin);
    url.searchParams.set('match', match.id);
    if (match.category === 'women') url.searchParams.set('category', 'women');
    try { await navigator.clipboard.writeText(url.href); setShareMessage('Match link copied'); }
    catch { setShareMessage(`Copy this match link: ${url.href}`); }
  };
  const status = match && ({ finished: 'Final score', retired: 'Retirement', walkover: 'Walkover', bye: 'Bye', ended: 'Unconfirmed score' }[match.status] || 'Result pending');
  const round = match && (match.round === 1 ? 'Final' : match.round === 2 ? 'Semi-final' : match.round === 4 ? 'Quarter-final' : match.roundName || 'Round unavailable');
  const winningTeam = match && ['finished', 'retired', 'walkover', 'bye'].includes(match.status) ? ({ team_1: 0, team_2: 1 }[match.winner]) : undefined;
  return createPortal(<dialog ref={dialog} className="pro-dialog pro-match-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pro-dialog-inner"><header className="pro-dialog-bar"><span>4M <b>MATCH DETAILS</b></span><div>{match && <button aria-label="Copy match link" onClick={share}>{shareMessage === 'Match link copied' ? <Check size={18} /> : <Share2 size={18} />}</button>}<button aria-label="Close match details" onClick={onClose} autoFocus><X size={22} /></button></div></header>
      {shareMessage && <p className="pro-share-message" role="status">{shareMessage}</p>}
      {!match ? <div className="pro-empty"><h2 id={titleId}>{loading ? 'Loading match…' : error ? 'Match temporarily unavailable' : 'Match not in this edition'}</h2><p>{loading ? 'Loading the saved tournament results.' : error || 'This link may refer to an older match outside our current results coverage.'}</p>{error && <button className="pro-button" onClick={onRetry}>Retry results</button>}</div> : <>
        <div className="pro-match-detail-heading"><p className="pro-eyebrow">{levelName(match.level)} · {match.category === 'women' ? 'WOMEN' : 'MEN'} · {round.toUpperCase()}</p><h2 id={titleId}>{match.tournamentName}</h2><p>{formatDate(match.playedAt)} <span>{status}</span></p></div>
        <div className="pro-modal-body">
          <div className="pro-match-pairs">{match.teams.map((team, index) => <section className={`pro-match-pair ${winningTeam === index ? 'is-winner' : ''}`} key={index} aria-label={`Pair ${index + 1}`}><div className="pro-match-pair-label"><span>PAIR {index + 1}</span>{winningTeam === index && <strong>{match.status === 'bye' ? 'Bye' : match.status === 'walkover' ? 'Advanced by walkover' : 'Winners'}</strong>}</div>{team.length ? team.map((person) => <div key={person.id}><MatchPlayer person={person} playerLookup={playerLookup} playerHref={playerHref} />{playerLookup[person.id]?.rank && <small>World #{playerLookup[person.id].rank} · Current ranking</small>}</div>) : <p>Pair unavailable</p>}</section>)}</div>
          <section className="pro-score-detail" aria-label="Set scores"><h3>Set by set</h3>{match.score.length ? <div className="pro-score-table-wrap"><table><caption className="sr-only">Scores as reported by the provider. Pair names are listed above.</caption><thead><tr><th scope="col">Pair</th>{match.score.map((_, index) => <th scope="col" key={index}>Set {index + 1}</th>)}</tr></thead><tbody>{match.teams.map((team, index) => <tr key={index} className={winningTeam === index ? 'is-winner' : ''}><th scope="row"><span>Pair {index + 1}</span><small>{team.map((person) => person.name).join(' / ') || 'Unavailable'}</small></th>{match.score.map((set, setIndex) => <td key={setIndex}>{set[index] || '—'}</td>)}</tr>)}</tbody></table></div> : <p className="pro-coverage">{match.status === 'walkover' || match.status === 'bye' ? 'No set scores: this match was not played.' : 'Set scores have not been provided.'}</p>}{match.score.some(set => set.some(score => String(score).includes('('))) && <p className="pro-coverage">Numbers in brackets are tie-break points reported with the set score.</p>}{match.status === 'retired' && <p className="pro-coverage">The match ended in retirement. The score may include an unfinished set.</p>}<p className="pro-coverage">Serve, break-point and point-by-point statistics are not available in this result.</p></section>
          {tournament && <div className="pro-match-event-info"><MapPin size={18} /><div><strong>{tournament.venue || tournament.location || 'Venue to be confirmed'}</strong><p><CountryLabel code={tournament.country} /> · {formatDate(tournament.startDate)} — {formatDate(tournament.endDate)}</p></div></div>}
          <p className="pro-modal-source">Results synced {formatDate(updatedAt)} · Padel API · Saved result</p>
        </div>
      </>}
    </div>
  </dialog>, document.body);
}
