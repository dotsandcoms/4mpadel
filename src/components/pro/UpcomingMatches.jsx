import React, { useState } from 'react';
import { MatchPlayer } from './ProMatchCards';
import { CalendarDays } from 'lucide-react';
import { followedMatches } from '../../utils/proFeed';
import { formatDate } from '../../utils/proPadelView';

export default function UpcomingMatches({ state, follows, playerLookup, playerHref, onRetry, playerId }) {
  const [viewTime] = useState(() => Date.now());
  const snapshot = state.snapshot;
  const selected = playerId ? (snapshot?.matches || []).filter((match) => match.teams.some((team) => team.some((person) => person.id === playerId))) : followedMatches(snapshot?.matches || [], follows);
  const sorted = selected.sort((a, b) => (a.scheduledAt || a.playedAt || '9999').localeCompare(b.scheduledAt || b.playedAt || '9999'));
  const matches = playerId ? sorted.slice(0, 1) : sorted;
  return <section className="pro-upcoming" aria-label={playerId ? "Player next match" : "Your upcoming matches"}>
    <div className="pro-results-controls"><h3><CalendarDays size={18} /> {playerId ? 'Next published match' : 'Up next for your players'}</h3></div>
    {state.loading ? <p role="status">Checking published fixtures…</p> : state.error ? <div role="alert"><p>{state.error}</p><button className="pro-button" onClick={onRetry}>Retry fixtures</button></div> : <>
      <p className="pro-coverage">{snapshot.coverage} · Checked {formatDate(snapshot.updatedAt)}. Saved schedule; times may change.</p>
      {viewTime - Date.parse(snapshot.updatedAt) > 48 * 3600_000 && <p className="pro-notice">This schedule is more than two days old and may no longer be current.</p>}
      {matches.length ? <div className="pro-results-grid">{matches.map((match) => <article className="pro-match pro-fixture" key={match.id}>
        <header><span>{match.tournamentName}</span><span>{match.round === 1 ? 'Final' : match.round === 2 ? 'Semi-final' : match.round === 4 ? 'Quarter-final' : `Round of ${match.round * 2}`}</span></header>
        <div className="pro-fixture-time"><strong>{match.scheduledAt ? `${formatDate(match.scheduledAt)} · ${new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }).format(new Date(match.scheduledAt))} SAST` : match.playedAt ? `${formatDate(match.playedAt)} · Time TBC` : 'Date and time TBC'}</strong><small>{/estimated/i.test(match.scheduleLabel || '') ? 'Estimated start · may change with earlier matches' : /not before/i.test(match.scheduleLabel || '') ? 'Not-before time · play may start later' : 'Start time subject to confirmation'}</small></div>
        {match.teams.map((team, index) => <div className="pro-match-team" key={index}><div className="pro-match-names">{team.length ? team.map((person) => <MatchPlayer key={person.id} person={person} playerLookup={playerLookup} playerHref={playerHref} />) : <span>Opponents to be confirmed</span>}</div><span>{index === 0 ? 'vs' : ''}</span></div>)}
        <footer><span>{match.court || 'Court TBC'}</span><span>Scheduled at last update</span></footer>
      </article>)}</div> : <div className="pro-upcoming-empty"><CalendarDays size={25} /><div><h4>{!snapshot.tournament ? 'No upcoming event listed' : !snapshot.drawPublished ? `${snapshot.tournament.name}: draw not published yet` : (playerId ? 'No upcoming match listed for this player' : 'No upcoming matches listed for your players')}</h4><p>{snapshot.tournament ? `Event starts ${formatDate(snapshot.tournament.startDate)}. Player participation and match times are confirmed only when listed in the published fixtures.` : 'Check back after the next tour update.'}</p></div></div>}
    </>}
  </section>;
}
