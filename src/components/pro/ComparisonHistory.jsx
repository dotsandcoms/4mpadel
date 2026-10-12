import React, { useState } from 'react';
import useProExplore from '../../hooks/useProExplore';
import { directMeetings } from '../../utils/proComparison';
import { ResultCard } from './ProMatchCards';
export default function ComparisonHistory({ first, second, playerLookup, playerHref }) {
  const [page, setPage] = useState(1);
  const state = useProExplore('comparison-history', { id: first.id, against: second.id, page });
  const meetings = directMeetings(state.data?.matches || [],first.id,second.id);
  return <section><h3 className="pro-compare-heading">Against each other</h3><p className="pro-coverage">Provider history across tournaments and rounds. Records below describe this page of played meetings; matches as partners, byes and walkovers are excluded.</p>
    {state.loading ? <p role="status">Loading head-to-head history…</p> : state.error ? <div role="alert"><p>{state.error}</p><button className="pro-button" onClick={state.retry}>Retry history</button></div> : <>
      {meetings.matches.length ? <><div className="pro-head-to-head"><span>{first.name}</span><strong>{meetings.firstWins} <small>–</small> {meetings.secondWins}</strong><span>{second.name}</span></div><div className="pro-results-grid">{meetings.matches.map(match => <ResultCard key={match.id} match={match} playerLookup={playerLookup} playerHref={playerHref} />)}</div></> : <p>No played opposing meetings reported on this page.</p>}
      {state.data?.pages > 1 && <div className="pro-directory-pages"><button disabled={page === 1} onClick={() => setPage(page-1)}>Previous</button><span>{state.data.total} provider records · Page {page}/{state.data.pages}</span><button disabled={page >= state.data.pages} onClick={() => setPage(page+1)}>Next</button></div>}
    </>}
  </section>;
}
