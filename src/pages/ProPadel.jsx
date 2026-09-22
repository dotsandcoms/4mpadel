import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Search, Globe2, RefreshCw, Trophy, CalendarDays, ChevronRight, Download, MapPin, SlidersHorizontal, Heart, ArrowLeftRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { loadProPadel, loadProTour, loadProFixtures } from '../services/proPadel';
import ProPlayerModal, { PlayerPortrait, ResultCard } from '../components/pro/ProPlayerModal';
import { countryName, formatDate, formatNumber, levelName, tournamentCalendar } from '../utils/proPadelView';
import CountryLabel from '../components/pro/CountryLabel';
import { RankChange } from '../components/pro/RankingMovement';
import './pro-padel.css';
import useProFollows from '../hooks/useProFollows';
import MyPadelFeed from '../components/pro/MyPadelFeed';
import AuthModal from '../components/AuthModal';
import PlayerComparison from '../components/pro/PlayerComparison';
import TourCalendar from '../components/pro/TourCalendar';
import FollowingHeart from '../components/pro/FollowingHeart';
import MatchDetailsModal from '../components/pro/MatchDetailsModal';
import { ProMatchContext } from '../components/pro/ProMatchContext';
import { proSection, proUrl } from '../utils/proUrl';

const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function saveCalendar(tournament) {
  const blob = new Blob([tournamentCalendar(tournament)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `4m-padel-${tournament.id}.ics`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProPadel() {
  const { id } = useParams();
  const follows = useProFollows();
  const [authOpen, setAuthOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const section = proSection(location.pathname, params);
  const canonicalUrl = id ? null : proUrl(section, params);
  useEffect(() => {
    if (canonicalUrl && canonicalUrl !== location.pathname + location.search) navigate(canonicalUrl, { replace: true, state: location.state });
  }, [canonicalUrl, location.pathname, location.search, location.state, navigate]);
  const selectedId = id || params.get('player');
  const selectedMatchId = !selectedId && params.get('match');
  const search = params.get('q') || '';
  const nation = params.get('country') || '';
  const side = params.get('side') || '';
  const eventId = params.get('event') || '';
  const [state, setState] = useState({ loading: true, snapshot: null, error: '' });
  const directPlayer = id && state.snapshot ? Object.values(state.snapshot.categories).flatMap((item) => item.players).find((item) => String(item.id) === id) : null;
  const category = directPlayer?.category || (params.get('category') === 'women' ? 'women' : 'men');
  const [tourState, setTourState] = useState({ loading: true, snapshot: null, error: '' });
  const [fixtureState, setFixtureState] = useState({ loading: true, snapshot: null, error: '' });
  const [fixtureAttempt, setFixtureAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [viewTime] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();
    loadProPadel(controller.signal).then((snapshot) => {
      if (!controller.signal.aborted) setState({ loading: false, snapshot, error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ loading: false, snapshot: null, error: 'We couldn’t load the rankings. Please try again.' });
    });
    loadProTour(controller.signal).then((snapshot) => {
      if (!controller.signal.aborted) setTourState({ loading: false, snapshot, error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setTourState({ loading: false, snapshot: null, error: 'Tournament information is temporarily unavailable.' });
    });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const controller = new AbortController();
    loadProFixtures(controller.signal).then((snapshot) => {
      if (!controller.signal.aborted) setFixtureState({ loading: false, snapshot, error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setFixtureState({ loading: false, snapshot: null, error: 'Upcoming fixtures are temporarily unavailable.' });
    });
    return () => controller.abort();
  }, [fixtureAttempt]);
  const retryFixtures = () => { setFixtureState({ loading: true, snapshot: null, error: '' }); setFixtureAttempt((value) => value + 1); };
  useEffect(() => {
    if (section === 'compare' && !state.loading) document.getElementById('pro-explore')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (section === 'compare' && !state.loading) document.querySelector('.pro-section-tabs button[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, [section, state.loading]);
  const retry = () => { setState({ loading: true, snapshot: null, error: '' }); setTourState({ loading: true, snapshot: null, error: '' }); setAttempt((value) => value + 1); };
  const snapshot = state.snapshot;
  const tour = tourState.snapshot;
  const players = snapshot?.categories[category]?.players || [];
  const allPlayers = snapshot ? Object.values(snapshot.categories).flatMap((item) => item.players) : [];
  const playerLookup = Object.fromEntries(allPlayers.map((player) => [player.id, player]));
  const player = selectedId ? playerLookup[selectedId] : null;
  const visible = players.filter((item) => fold(`${item.name} ${countryName(item.nationality)}`).includes(fold(search)) && (!nation || item.nationality === nation) && (!side || item.side === side));
  const rankingPages = Math.max(1, Math.ceil(visible.length / 20));
  const requestedPage = Number(params.get('page') || params.get('rankingPage') || 1);
  const rankingPage = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(rankingPages, requestedPage)) : 1;
  const rankingOffset = (rankingPage - 1) * 20;
  const pagePlayers = visible.slice(rankingOffset, rankingOffset + 20);
  const countries = [...new Set(players.map((p) => p.nationality).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const tournaments = (tour?.tournaments || []).filter((t) => t.status !== 'cancelled');
  const upcoming = tournaments.filter((t) => ['pending', 'live'].includes(t.status) && t.endDate.slice(0, 10) >= new Date(viewTime).toISOString().slice(0, 10)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const nextEvent = upcoming[0];
  const covered = tournaments.filter((t) => tour?.coveredTournamentIds?.includes(t.id));
  const results = (tour?.matches || []).filter((m) => m.category === category && (!eventId || String(m.tournamentId) === eventId)).sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || '') || a.round - b.round);
  const latestFinal = (tour?.matches || []).filter((m) => m.category === category && m.round === 1 && m.status === 'finished').sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || ''))[0];
  const oldSnapshot = snapshot && viewTime - Date.parse(snapshot.updatedAt) > 48 * 3600_000;
  const oldTour = tour && viewTime - Date.parse(tour.updatedAt) > 48 * 3600_000;
  const setFilter = (key, value) => { const next = new URLSearchParams(params); if (['q', 'country', 'side', 'category'].includes(key)) { next.delete('rankingPage'); next.delete('page'); } value ? next.set(key, value) : next.delete(key); navigate(proUrl(key === 'view' ? value : section, next), { replace: key === 'q' }); };
  const changeRankingPage = (page) => {
    setFilter('page', page === 1 ? '' : String(page));
    document.getElementById('pro-explore')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  const playerHref = (playerId) => { const next = new URLSearchParams(params); next.set('player', playerId); next.delete('match'); return proUrl(section, next); };
  const closePlayer = () => {
    if (location.state?.proModal) navigate(-1);
    else { const next = new URLSearchParams(params); next.delete('player'); if (id && player?.category === 'women') next.set('category', 'women'); navigate(proUrl(section, next), { replace: true }); }
  };
  const comparePlayers = (first, second, competition = category) => { const next = new URLSearchParams(params); next.set('view', 'compare'); next.set('category', competition); next.set('compare', first); second ? next.set('against', second) : next.delete('against'); next.delete('player'); navigate(proUrl('compare', next), { replace: Boolean(selectedId) }); };
  const openMatch = (matchId) => { const next = new URLSearchParams(params); next.delete('player'); next.set('match', matchId); navigate(proUrl(section, next), { state: { proMatch: true } }); };
  const closeMatch = () => { if (location.state?.proMatch) navigate(-1); else { const next = new URLSearchParams(params); next.delete('match'); navigate(proUrl(section, next), { replace: true }); } };
  const selectedMatch = (tour?.matches || []).find((match) => String(match.id) === String(selectedMatchId));
  const clearFilters = () => { const next = new URLSearchParams(params); ['q', 'country', 'side', 'rankingPage', 'page'].forEach((key) => next.delete(key)); setParams(next, { replace: true }); };

  return <ProMatchContext.Provider value={openMatch}><main className="pro-page">
    <Helmet><title>{player ? `${player.name} · ` : ''}Pro Padel | 4M Padel</title><meta name="description" content="Explore the world of professional padel. Rankings, player profiles, Premier Padel results and the upcoming tour calendar." /></Helmet>
    <div className="pro-container">
      <div className="pro-topline"><nav aria-label="Breadcrumb"><Link to="/">4M Padel</Link><span>/</span><span>Pro Padel</span></nav><Link to="/rankings">South African rankings <ArrowUpRight size={14} /></Link></div>
      {state.loading ? <div className="pro-state" role="status"><RefreshCw size={24} /><h1>Loading the world of padel</h1><p>Getting the latest saved update.</p></div> : state.error ? <div className="pro-state" role="alert"><h1>Rankings unavailable</h1><p>{state.error}</p><button className="pro-button" onClick={retry}>Try again</button></div> : <>
        <header className="pro-hero">
          <div className="pro-hero-copy"><p className="pro-eyebrow"><Globe2 size={15} /> 4M / PRO PADEL</p><h1>The world<br />plays here<span>.</span></h1><p className="pro-hero-intro">Big names. Defining matches. Your front row to the professional game.</p><div className="pro-hero-bottom"><div><strong>{snapshot.limit}</strong><span>leading {category === 'men' ? 'men' : 'women'}</span></div><div><strong>{countries.length}</strong><span>nations represented</span></div><a href="#pro-explore">Explore the tour <ChevronRight size={17} /></a></div></div>
          <div className="pro-leaders"><div className="pro-leaders-heading"><span>AT THE TOP OF THE GAME</span><div className="pro-toggle" aria-label="Competition category">{['men', 'women'].map((value) => <button key={value} aria-pressed={category === value} onClick={() => setFilter('category', value)}>{value === 'men' ? 'Men' : 'Women'}</button>)}</div></div><div className="pro-leader-grid">{players.slice(0, 3).map((item, index) => <Link className={`pro-leader leader-${index}`} key={item.id} to={playerHref(item.id)} state={{ proModal: true }} aria-haspopup="dialog" aria-label={`Explore ${item.name} profile${follows.isFollowing(item.id) ? ' · Following' : ''}`}><span className="pro-leader-rank">#{item.rank}</span><PlayerPortrait player={item} className="pro-leader-photo" /><div className="pro-leader-caption"><span><CountryLabel code={item.nationality} /></span><h2>{item.name}<FollowingHeart following={follows.isFollowing(item.id)} size={17} /></h2><p>{formatNumber(item.points)} PTS <ArrowUpRight size={17} /></p></div></Link>)}</div><p className="pro-leaders-edition">Official rankings · {formatDate(players[0]?.rankingDate)}</p></div>
        </header>
        {oldSnapshot && <p className="pro-notice" role="status">Rankings show our last saved update from {formatDate(snapshot.updatedAt)}. A newer update is pending.</p>}
        {oldTour && <p className="pro-notice">Tour data was last synced on {formatDate(tour.updatedAt)}. Schedules may have changed.</p>}
        <div className="pro-tour-strip"><div><span className="pro-pulse" /><span>ON THE TOUR</span></div>{nextEvent ? <><p><b>{nextEvent.name}</b><span>{formatDate(nextEvent.startDate)} – {formatDate(nextEvent.endDate)}</span></p><button onClick={() => { setFilter('view', 'calendar'); document.getElementById('pro-explore')?.scrollIntoView({ block: 'start' }); }}>View calendar <ArrowUpRight size={16} /></button></> : <p>{tourState.loading ? 'Loading the tour calendar…' : 'Explore the professional tour calendar below.'}</p>}</div>
        <section id="pro-explore" className="pro-explore" aria-label="Explore professional padel">
          <nav className="pro-section-tabs" aria-label="Pro Padel sections">{[['following', Heart, 'My Padel'], ['rankings', Trophy, 'World rankings'], ['results', Globe2, 'Recent results'], ['calendar', CalendarDays, 'Tour calendar'], ['compare', ArrowLeftRight, 'Compare players']].map(([key, Icon, label]) => <button key={key} aria-pressed={section === key} onClick={() => setFilter('view', key)}>{React.createElement(Icon, { size: 17 })}{label}</button>)}</nav>
          <div key={section} className="pro-section-content">
          {section === 'compare' ? <PlayerComparison players={players} firstId={params.get('compare')} secondId={params.get('against')} onChange={comparePlayers} tourState={tourState} playerHref={playerHref} playerLookup={playerLookup} onRetry={retry} /> : section === 'following' ? <MyPadelFeed fixtureState={fixtureState} onRetryFixtures={retryFixtures} follows={follows} tourState={tourState} playerLookup={playerLookup} playerHref={playerHref} onSignIn={() => setAuthOpen(true)} onExplore={() => setFilter('view', 'rankings')} onRetry={retry} /> : section === 'rankings' ? <div className="pro-ranking-layout"><div>
            <div className="pro-section-title"><div><p className="pro-eyebrow">THE RANKING ROOM</p><h2>{category === 'men' ? 'Men’s' : 'Women’s'} world rankings</h2></div><span>TOP {snapshot.limit}</span></div>
            <div className="pro-controls"><label className="pro-search"><Search size={17} /><span className="sr-only">Search players or countries</span><input type="search" placeholder="Find a player or country…" value={search} onChange={(event) => setFilter('q', event.target.value)} /></label><label className="pro-select"><span className="sr-only">Filter by country</span><select value={nation} onChange={(event) => setFilter('country', event.target.value)}><option value="">All countries</option>{countries.map((code) => <option key={code} value={code}>{countryName(code)}</option>)}</select></label><label className="pro-select"><span className="sr-only">Filter by playing side</span><select value={side} onChange={(event) => setFilter('side', event.target.value)}><option value="">Both sides</option><option value="backhand">Left side</option><option value="drive">Right side</option></select></label></div>
            <div className="pro-result-count" aria-live="polite"><span>{visible.length ? `Showing ${rankingOffset + 1}–${Math.min(rankingOffset + 20, visible.length)} of ` : ''}{visible.length} {visible.length === 1 ? 'player' : 'players'}</span>{(search || nation || side) && <button onClick={clearFilters}>Clear filters</button>}<span><SlidersHorizontal size={12} /> Official ranking order</span></div>
            {visible.length ? <div className="pro-table-wrap"><table className="pro-table"><caption className="sr-only">{category} official world rankings</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col" className="pro-country-column">Country</th><th scope="col" className="pro-points">Points</th><th scope="col"><span className="sr-only">Profile</span></th></tr></thead><tbody>{pagePlayers.map((item) => <tr key={item.id}><td className={`pro-rank ${item.rank <= 3 ? 'pro-rank-leading' : ''}`}>{String(item.rank).padStart(2, '0')}<RankChange value={item.rankChange} /></td><td><Link className="pro-player-link" to={playerHref(item.id)} state={{ proModal: true }} aria-haspopup="dialog"><PlayerPortrait player={item} /><span>{item.name}<FollowingHeart following={follows.isFollowing(item.id)} /><small><CountryLabel code={item.nationality} /></small></span></Link></td><td className="pro-country-column"><CountryLabel code={item.nationality} /></td><td className="pro-points"><span>{formatNumber(item.points)}</span><div className="pro-points-track" aria-hidden="true"><i style={{ width: `${players[0]?.points ? Math.max(0, Math.min(100, item.points / players[0].points * 100)) : 0}%` }} /></div></td><td><span className="pro-profile-link" aria-hidden="true"><ArrowUpRight size={17} /></span></td></tr>)}</tbody></table></div> : <div className="pro-empty"><Search size={24} /><h3>No matching players</h3><p>Try another name, country or playing side.</p><button className="pro-button" onClick={clearFilters}>Clear filters</button></div>}
            {rankingPages > 1 && <nav className="pro-ranking-pagination" aria-label="World rankings pages"><button disabled={rankingPage === 1} onClick={() => changeRankingPage(rankingPage - 1)}>Previous</button><div>{Array.from({ length: rankingPages }, (_, index) => index + 1).map((page) => <button key={page} aria-label={`Rankings page ${page}`} aria-current={page === rankingPage ? 'page' : undefined} onClick={() => changeRankingPage(page)}>{page}</button>)}</div><button disabled={rankingPage === rankingPages} onClick={() => changeRankingPage(rankingPage + 1)}>Next</button></nav>}
          </div><aside className="pro-sidebar"><div className="pro-sidebar-title"><Trophy size={16} /><span>THE LAST FINAL</span></div>{latestFinal ? <ResultCard match={latestFinal} playerLookup={playerLookup} playerHref={playerHref} /> : <p className="pro-coverage">{tourState.loading ? 'Loading recent results…' : 'Results are not available yet.'}</p>}<button className="pro-text-button" onClick={() => setFilter('view', 'results')}>Explore recent results <ArrowUpRight size={16} /></button><div className="pro-next-event"><p className="pro-eyebrow">NEXT ON THE TOUR</p><span className="pro-event-level">{nextEvent ? levelName(nextEvent.level) : 'PREMIER PADEL'}</span><h3>{nextEvent?.name || 'The tour continues'}</h3>{nextEvent && <><p><MapPin size={14} /> <CountryLabel code={nextEvent.country} label={nextEvent.location} /></p><p>{formatDate(nextEvent.startDate)}</p><button className="pro-button" onClick={() => saveCalendar(nextEvent)}><Download size={15} /> Add to calendar</button></>}</div><p className="pro-sidebar-note">Rankings and results update from saved tour data. Live scoring is not available here yet.</p></aside></div> : <>
            <div className="pro-section-title"><div><p className="pro-eyebrow">PREMIER PADEL</p><h2>{section === 'calendar' ? 'Follow the tour around the world' : `${category === 'men' ? 'Men’s' : 'Women’s'} recent results`}</h2></div></div>
            {tourState.loading ? <div className="pro-state" role="status">Loading tournament data…</div> : tourState.error ? <div className="pro-state" role="alert"><p>{tourState.error}</p><button className="pro-button" onClick={retry}>Try again</button></div> : <>

              {section === 'results' ? <><div className="pro-results-controls"><p className="pro-coverage">Quarter-finals onward · Latest two completed events · {formatDate(tour.updatedAt)}</p><label className="pro-select"><span className="sr-only">Filter results by tournament</span><select value={eventId} onChange={(event) => setFilter('event', event.target.value)}><option value="">Both tournaments</option>{covered.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>{results.length ? <div className="pro-results-grid">{results.map((match) => <ResultCard key={match.id} match={match} playerLookup={playerLookup} playerHref={playerHref} />)}</div> : <div className="pro-empty"><h3>No results in this selection</h3><button className="pro-button" onClick={() => setFilter('event', '')}>Show both tournaments</button></div>}</> : <TourCalendar events={upcoming} updatedAt={tour.updatedAt} onSave={saveCalendar} />}
            </>}
          </>}
          </div>
        </section>
        <footer className="pro-source"><span>Rankings synced {formatDate(snapshot.updatedAt)} · {new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }).format(new Date(snapshot.updatedAt))} SAST</span></footer>
        {selectedMatchId && <MatchDetailsModal key={selectedMatchId} match={selectedMatch} tournament={tournaments.find((event) => event.id === selectedMatch?.tournamentId)} loading={tourState.loading} error={tourState.error} updatedAt={tour?.updatedAt} playerLookup={playerLookup} playerHref={playerHref} onClose={closeMatch} onRetry={retry} />}
        {selectedId && <ProPlayerModal fixtureState={fixtureState} onRetryFixtures={retryFixtures} onOpenPlayer={(id) => navigate(playerHref(id), { replace: true, state: location.state })} key={selectedId} playerLookup={playerLookup} player={player} tour={tour} tourError={tourState.error} onClose={closePlayer} updatedAt={snapshot.updatedAt} follows={follows} onCompare={() => comparePlayers(player.id, null, player.category)} onSignIn={() => { closePlayer(); setAuthOpen(true); }} />}
      </>}
    </div>
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
  </main></ProMatchContext.Provider>;
}
