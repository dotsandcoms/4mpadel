import React from 'react';
import { Trophy } from 'lucide-react';
import { tournamentJourneys } from '../../utils/proJourney';
import { ResultCard } from './ProMatchCards';

export default function TournamentJourney({ player, tour, tourError, playerLookup }) {
  if (!tour) return <p role={tourError ? 'alert' : 'status'}>{tourError || 'Loading tournament journeys…'}</p>;
  const events = tournamentJourneys(tour.matches, player.id);
  return <section className="pro-journeys" aria-label="Tournament journeys">
    <p className="pro-coverage">{tour.coverage}. Follow each event from the earliest covered round. Earlier rounds and missing matches are not shown.</p>
    {events.length ? events.map((event, index) => <details className="pro-journey" key={event.id} open={index === 0}>
      <summary><Trophy size={18} /><span>{event.name}<small>{event.matches.length} covered {event.matches.length === 1 ? 'match' : 'matches'} · earliest round first</small></span></summary>
      <ol>{event.matches.map((match) => <li key={match.id}><h4>{match.round === 1 ? 'Final' : match.round === 2 ? 'Semi-final' : match.round === 4 ? 'Quarter-final' : `Round of ${match.round * 2}`}</h4><ResultCard match={match} playerId={player.id} playerLookup={playerLookup} /></li>)}</ol>
    </details>) : <div className="pro-empty"><Trophy size={28} /><h3>No journey in this selection</h3><p>This player has no matches in the covered rounds.</p></div>}
  </section>;
}
