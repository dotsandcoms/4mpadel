import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playerProfileUrl } from '../../utils/proUrl';
import CountryLabel from './CountryLabel';
import FollowPlayerButton from './FollowPlayerButton';
import PlayerInsights from './PlayerInsights';
import UpcomingMatches from './UpcomingMatches';
import TournamentJourney from './TournamentJourney';
import { PlayerPortrait, ResultCard } from './ProMatchCards';
export { PlayerPortrait, MatchPlayer, ResultCard } from './ProMatchCards';
import { RankChange, PointChange } from './RankingMovement';
import { X, Share2, Check, Trophy, ArrowUpRight } from 'lucide-react';
import { formatDate, formatNumber, playerResult } from '../../utils/proPadelView';

export default function ProPlayerModal({ player, tour, tourError, onClose, updatedAt, follows, onSignIn, onCompare, fixtureState, onRetryFixtures, onOpenPlayer, playerLookup = {} }) {
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  const [tab, setTab] = useState('overview');
  const [shareMessage, setShareMessage] = useState('');
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const matches = (tour?.matches || []).filter((m) => m.teams.some((team) => team.some((p) => p.id === player?.id))).sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || '') || a.round - b.round);
  const played = matches.map((match) => playerResult(match, player?.id)).filter(Boolean);
  const wins = played.filter((result) => result === 'W').length;
  const share = async () => {
    try { await navigator.clipboard.writeText(player ? new URL(playerProfileUrl(player), window.location.origin).href : window.location.href); setShareMessage('Link copied'); }
    catch { setShareMessage('Copy this page’s address to share the profile.'); }
  };
  const trapFocus = (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not([disabled]), a[href], input, select, summary, [tabindex="0"]')].filter((element) => element.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<dialog ref={dialog} className="pro-dialog" aria-labelledby="pro-modal-title" onKeyDown={trapFocus} onCancel={(event) => { event.preventDefault(); closeRef.current(); }} onClick={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}>
    <div className="pro-dialog-inner">
      <header className="pro-dialog-bar"><span>4M <b>PRO PADEL</b></span><div>{player && <FollowPlayerButton player={player} follows={follows} onSignIn={onSignIn} iconOnly />}<button type="button" aria-label="Copy player profile link" onClick={share}>{shareMessage === 'Link copied' ? <Check size={18} /> : <Share2 size={18} />}</button><button type="button" className="pro-modal-close" aria-label="Close player profile" onClick={onClose} autoFocus><X size={22} /></button></div></header>
      {shareMessage && <p className="pro-share-message" role="status">{shareMessage}</p>}
      {player ? <>
        <div className="pro-modal-hero"><div><p className="pro-eyebrow">{player.category === 'women' ? 'WOMEN’S' : 'MEN’S'} WORLD RANKING <b>#{player.rank}</b></p><h2 id="pro-modal-title">{player.name}</h2><p><CountryLabel code={player.nationality} /></p><span className="pro-profile-category">PROFESSIONAL PADEL</span></div><PlayerPortrait key={player.id} player={player} className="pro-modal-photo" /></div>
        <div className="pro-modal-follow"><FollowPlayerButton player={player} follows={follows} onSignIn={onSignIn} /><span>Follow for your personalised My Padel feed</span><button className="pro-text-button" onClick={onCompare}>Compare player <ArrowUpRight size={16} /></button></div>
        {follows.error && <div className="pro-notice" role="alert">{follows.error} <button className="pro-text-button" onClick={follows.retry}>Retry</button></div>}
        <nav className="pro-modal-tabs" aria-label="Player details"><button aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button><button aria-pressed={tab === 'results'} onClick={() => setTab('results')}>Recent results {tour && <span>{matches.length}</span>}</button><button aria-pressed={tab === 'form'} onClick={() => setTab('form')}>Form &amp; partners</button><button aria-pressed={tab === 'journey'} onClick={() => setTab('journey')}>Tournament journey</button></nav>
        <div key={tab} className="pro-modal-body">
          {tab === 'overview' ? <>
            <div className="pro-modal-stats"><div><span>World ranking</span><strong>#{player.rank}</strong><small>Official ranking <RankChange value={player.rankChange} /></small></div><div><span>Ranking points</span><strong>{formatNumber(player.points)}</strong><small>{formatDate(player.rankingDate)} <PointChange value={player.pointsChange} /></small></div><div><span>Covered rounds</span><strong>{played.length ? `${wins}W · ${played.length - wins}L` : '—'}</strong><small>Latest two events · QF onward</small></div></div>
            <button className="pro-text-button pro-form-cta" onClick={() => setTab('form')}>Explore form &amp; playing partners <ArrowUpRight size={16} /></button>
            <UpcomingMatches state={fixtureState} playerId={player.id} playerLookup={playerLookup} onRetry={onRetryFixtures} />
            <div className="pro-modal-bio"><div><p className="pro-eyebrow">PLAYER DNA</p><h3>Behind the ranking</h3><p>The details that make their game.</p></div><dl>{[
              ['Country', <CountryLabel key="country" code={player.nationality} />], ['Playing side', player.side === 'drive' ? 'Right side' : player.side === 'backhand' ? 'Left side' : null],
              ['Plays', player.hand ? `${player.hand === 'left' ? 'Left' : 'Right'}-handed` : null], ['Height', player.height ? `${player.height} cm` : null],
              ['Born', player.birthdate ? formatDate(player.birthdate) : null], ['Birthplace', player.birthplace],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not available'}</dd></div>)}</dl></div>
            {matches.length > 0 && <div className="pro-modal-last"><h3><Trophy size={16} /> Latest covered result</h3><ResultCard match={matches[0]} playerId={player.id} playerLookup={playerLookup} /><button className="pro-text-button" onClick={() => setTab('results')}>Explore results <ArrowUpRight size={16} /></button></div>}
          </> : tab === 'journey' ? <TournamentJourney player={player} tour={tour} tourError={tourError} playerLookup={playerLookup} /> : tab === 'form' ? <PlayerInsights playerLookup={playerLookup} onOpenPlayer={onOpenPlayer} player={player} tour={tour} tourError={tourError} onResults={() => setTab('results')} /> : <><p className="pro-coverage">{tour?.coverage || (tourError ? 'Results are temporarily unavailable.' : 'Loading tournament results…')}. This is a selected-round record, not career statistics.</p>{matches.length ? <div className="pro-modal-results">{matches.map((match) => <ResultCard key={match.id} match={match} playerId={player.id} playerLookup={playerLookup} />)}</div> : <div className="pro-empty"><Trophy size={28} /><h3>No results in this selection</h3><p>This player has no matches in the covered quarter-finals, semi-finals or finals.</p></div>}</>}
          <p className="pro-modal-source">Rankings synced {formatDate(updatedAt)}{tour && ` · Results synced ${formatDate(tour.updatedAt)}`} · Padel API</p>
        </div>
      </> : <div className="pro-empty"><h2 id="pro-modal-title">Player not in this edition</h2><p>Explore the top 50 men and women from the rankings.</p><button className="pro-button" onClick={onClose}>Back to rankings</button></div>}
    </div>
  </dialog>, document.body);
}
