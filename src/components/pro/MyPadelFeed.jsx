import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { followedMatches } from '../../utils/proFeed';
import { formatDate } from '../../utils/proPadelView';
import { ResultCard, PlayerPortrait } from './ProPlayerModal';
import UpcomingMatches from './UpcomingMatches';
import RankingMovement from './RankingMovement';
import FollowPlayerButton from './FollowPlayerButton';
import CountryLabel from './CountryLabel';

export default function MyPadelFeed({ follows, tourState, playerLookup, playerHref, onSignIn, onExplore, onRetry, fixtureState, onRetryFixtures }) {
  const matches = followedMatches(tourState.snapshot?.matches || [], follows.rows);
  return <div className="pro-my-padel">
    <div className="pro-section-title"><div><p className="pro-eyebrow">YOUR PLAYERS. YOUR GAME.</p><h2>My Padel</h2></div><Heart size={26} /></div>
    {follows.loading ? <div className="pro-state" role="status">Loading your players…</div> : !follows.signedIn ? <div className="pro-empty"><Heart size={30} /><h3>Make the tour your own</h3><p>Sign in with your 4M account, follow your favourite players and find their results here.</p><button className="pro-button" onClick={onSignIn}>Sign in to follow players</button></div> : follows.error ? <div className="pro-empty" role="alert"><p>{follows.error}</p><button className="pro-button" onClick={follows.retry}>Retry</button></div> : !follows.rows.length ? <div className="pro-empty"><Heart size={30} /><h3>Who’s your first pick?</h3><p>Open a player’s profile and tap Follow player. Your selections are saved to your 4M account.</p><button className="pro-button" onClick={onExplore}>Explore world rankings</button></div> : <>
      <p className="pro-coverage">Following {follows.rows.length} {follows.rows.length === 1 ? 'player' : 'players'} · Men and women · Saved to your account</p>
      <div className="pro-followed-list">{follows.rows.map((row) => {
        const player = playerLookup[row.player_id] || { id: row.player_id, name: row.player_name, category: row.category };
        const identity = <><PlayerPortrait player={player} className="pro-followed-photo" /><div className="pro-followed-details"><strong>{player.name}</strong><small>{player.rank ? `World #${player.rank}` : 'Outside this ranking edition'} · {player.category === 'men' ? 'Men' : 'Women'}</small>{player.nationality && <CountryLabel code={player.nationality} />}</div></>;
        return <div className="pro-followed-player" key={row.player_id}>{playerLookup[row.player_id] ? <Link className="pro-followed-identity" to={playerHref(player.id)} state={{ proModal: true }} aria-haspopup="dialog">{identity}</Link> : <div className="pro-followed-identity">{identity}</div>}<FollowPlayerButton player={player} follows={follows} onSignIn={onSignIn} /></div>;
      })}</div>
      <RankingMovement follows={follows.rows} playerLookup={playerLookup} playerHref={playerHref} />
      <UpcomingMatches state={fixtureState} follows={follows.rows} playerLookup={playerLookup} playerHref={playerHref} onRetry={onRetryFixtures} />
      <div className="pro-results-controls"><h3>Your latest results</h3><button className="pro-text-button" onClick={onExplore}>Find more players</button></div>
      {tourState.loading ? <p role="status">Loading results…</p> : tourState.error ? <div role="alert"><p>{tourState.error}</p><button className="pro-button" onClick={onRetry}>Retry results</button></div> : <><p className="pro-coverage">{tourState.snapshot?.coverage} · Updated {formatDate(tourState.snapshot?.updatedAt)}. Shared matches appear once.</p>{matches.length ? <div className="pro-results-grid">{matches.map((match) => <ResultCard key={match.id} match={match} playerLookup={playerLookup} playerHref={playerHref} />)}</div> : <div className="pro-empty"><h3>No results in the covered rounds</h3><p>Your players are saved. Their matches will appear when included in a future tour update.</p></div>}</>}
      <p className="pro-coverage">Match alerts are not enabled yet.</p>
    </>}
  </div>;
}
