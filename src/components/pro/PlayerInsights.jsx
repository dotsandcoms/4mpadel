import React from 'react';
import { MatchPlayer } from './ProMatchCards';
import { Activity, Users, Trophy } from 'lucide-react';
import { playerInsights } from '../../utils/proPlayerInsights';
import { formatDate } from '../../utils/proPadelView';

export default function PlayerInsights({ player, tour, tourError, onResults, playerLookup = {}, onOpenPlayer }) {
  if (!tour) return <div className="pro-empty" role={tourError ? 'alert' : 'status'}><Activity size={28} /><h3>{tourError ? 'Form is temporarily unavailable' : 'Loading player form…'}</h3><p>{tourError || 'Calculating from the saved tour results.'}</p></div>;
  const insights = playerInsights(tour.matches, player.id);
  const scores = insights.scores;
  return <section className="pro-insights" aria-label="Player form and partners">
    <p className="pro-coverage">{tour.coverage}. All figures below describe these covered rounds only, not season or career totals.</p>
    {!insights.played ? <div className="pro-empty"><Activity size={28} /><h3>No played matches in this selection</h3><p>Form and partner records will appear when this player has results in the covered rounds. Byes and walkovers do not count as played matches.</p></div> : <>
      <div className="pro-form-heading"><h3><Activity size={17} /> Form in covered rounds</h3><span>NEWEST FIRST</span></div>
      <div className="pro-form-strip" aria-label="Recent results, newest first">{insights.form.map((match) => <button key={match.id} className={`pro-form-result result-${match.result}`} onClick={onResults} aria-label={`${match.result === 'W' ? 'Win' : 'Loss'} at ${match.event}, ${formatDate(match.date)}. View recent results.`} title={`${match.event} · ${formatDate(match.date)}`}>{match.result}</button>)}</div>
      <div className="pro-modal-stats"><div><span>Matches played</span><strong>{insights.played}</strong><small>{insights.wins} {insights.wins === 1 ? 'win' : 'wins'} · {insights.losses} {insights.losses === 1 ? 'loss' : 'losses'}</small></div><div><span>Win rate</span><strong>{insights.winRate}%</strong><small>In this selection</small></div><div><span>Set record</span><strong>{scores.matches ? `${scores.setsWon}–${scores.setsLost}` : '—'}</strong><small>Won–lost · complete scores</small></div></div>
      {scores.matches > 0 && <div className="pro-games-record"><div><span>Games won / lost</span><strong>{scores.gamesWon} / {scores.gamesLost}</strong></div><div className="pro-games-bar" aria-hidden="true"><i style={{ width: `${scores.gamesWon / (scores.gamesWon + scores.gamesLost) * 100}%` }} /></div><p>Sets and games use {scores.matches} finished {scores.matches === 1 ? 'match' : 'matches'} with complete scorelines. Retirements are excluded from these two metrics.</p></div>}
      <div className="pro-insight-block"><h3><Users size={17} /> Partners in these matches</h3>{insights.partners.map((partner) => <div className="pro-partner-row" key={partner.id}><div><div className="pro-partner-identity">{playerLookup[partner.id] ? <button className="pro-partner-link" onClick={() => onOpenPlayer(partner.id)} aria-label={`Open ${partner.name} profile`}><MatchPlayer person={partner} playerLookup={playerLookup} /></button> : <MatchPlayer person={partner} playerLookup={playerLookup} />}</div><small>{partner.played} {partner.played === 1 ? 'match' : 'matches'} together in this selection</small></div><span>{partner.wins}W · {partner.played - partner.wins}L</span></div>)}</div>
      <div className="pro-insight-block"><h3><Trophy size={17} /> Tournament record</h3><p className="pro-coverage">Highest round recorded in the covered matches.</p>{insights.events.map((event) => <div className="pro-event-record" key={event.id}><div><strong>{event.name}</strong><small>{event.wins} {event.wins === 1 ? 'win' : 'wins'} · {event.losses} {event.losses === 1 ? 'loss' : 'losses'} in covered rounds</small></div><span className={event.champion ? 'is-champion' : ''}>{event.champion ? 'Champion' : event.round === 1 ? 'Final' : event.round === 2 ? 'Semi-final' : event.round === 4 ? 'Quarter-final' : `Round of ${event.round * 2}`}</span></div>)}</div>
      <button className="pro-text-button" onClick={onResults}>See the matches behind these numbers →</button>
    </>}
  </section>;
}
