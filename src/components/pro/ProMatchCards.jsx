import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { ProMatchContext } from './ProMatchContext';
import { ArrowUpRight } from 'lucide-react';
import CountryLabel from './CountryLabel';
import { formatDate, playerResult } from '../../utils/proPadelView';

export function PlayerPortrait({ player, className = '', loading }) {
  const [failed, setFailed] = useState(false);
  return <div className={`pro-portrait ${className}`}>
    {player.photoUrl && !failed ? <img src={player.photoUrl} alt="" width="320" height="360" loading={loading || (className ? 'eager' : 'lazy')} onError={() => setFailed(true)} /> : <span aria-hidden="true">{player.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span>}
  </div>;
}

export function MatchPlayer({ person, playerLookup = {}, playerHref }) {
  const profile = playerLookup[person.id];
  const content = <><PlayerPortrait key={person.id} player={profile || person} className="pro-match-avatar" loading="lazy" /><span className="pro-match-person-name">{person.name}{profile?.nationality && <CountryLabel code={profile.nationality} flagOnly />}</span></>;
  return profile && playerHref ? <Link className="pro-match-person" to={playerHref(person.id)} state={{ proModal: true }} aria-haspopup="dialog">{content}</Link> : <div className="pro-match-person">{content}</div>;
}

export function ResultCard({ match, playerId, playerLookup = {}, playerHref }) {
  const openMatch = useContext(ProMatchContext);
  const outcome = playerId ? playerResult(match, playerId) : null;
  return <article className="pro-match">
    <header><span>{match.tournamentName}</span><span className={outcome ? `pro-outcome outcome-${outcome}` : ''}>{outcome || (match.round === 1 ? 'FINAL' : match.round === 2 ? 'SEMI-FINAL' : 'QUARTER-FINAL')}</span></header>
    {match.teams.map((team, index) => <div className={`pro-match-team ${match.winner === `team_${index + 1}` ? 'is-winner' : ''}`} key={index}>
      <div className="pro-match-names">{team.map((person) => <MatchPlayer key={person.id} person={person} playerLookup={playerLookup} playerHref={playerHref} />)}</div>
      <div className="pro-set-scores">{match.score.map((set, setIndex) => <span key={setIndex}>{set[index] ?? '—'}</span>)}{match.winner === `team_${index + 1}` && <span className="sr-only">Winning pair</span>}</div>
    </div>)}
    <footer><span>{formatDate(match.playedAt)} · {match.round === 1 ? 'Final' : match.round === 2 ? 'Semi-final' : 'Quarter-final'}</span><span>{({ finished: 'Final score', retired: 'Retirement', walkover: 'Walkover', bye: 'Bye', ended: 'Unconfirmed score' })[match.status] || 'Result pending'}</span></footer>
    {openMatch && <button className="pro-match-details-button" aria-haspopup="dialog" aria-label={`Match details: ${match.teams.flat().map(person => person.name).join(', ')} · ${match.tournamentName}`} onClick={() => openMatch(match.id)}>Match details <ArrowUpRight size={15} /></button>}
  </article>;
}

