import React, { useState } from 'react';
import useProExplore from '../../hooks/useProExplore';
import { ResultCard } from './ProMatchCards';
import { formatDate } from '../../utils/proPadelView';
export default function MatchAnalysis({ match, playerLookup, playerHref }) {
  const [tab, setTab] = useState('stats');
  const [scope, setScope] = useState('match');
  const [page, setPage] = useState(1);
  const state = useProExplore(tab === 'stats' ? 'match-stats' : 'head-to-head', { id: match.id, ...(tab === 'history' ? { page } : {}) });
  const rows = state.data?.stats?.[scope] || [];
  return <section className="pro-match-analysis"><nav className="pro-modal-tabs" aria-label="Match analysis"><button aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>Match statistics</button><button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>Previous meetings</button></nav>
    {state.loading ? <p role="status">Loading {tab === 'stats' ? 'match statistics' : 'previous meetings'}…</p> : state.error ? <div role="alert"><p>{state.error}</p><button className="pro-button" onClick={state.retry}>Retry analysis</button></div> : tab === 'stats' ? <>
      <div className="pro-analysis-scopes" aria-label="Statistics scope">{['match','set_1','set_2','set_3'].map((key,index) => <button key={key} aria-pressed={scope === key} onClick={() => setScope(key)}>{index ? `Set ${index}` : 'Whole match'}</button>)}</div>
      {rows.length ? <div className="pro-score-table-wrap"><table className="pro-stat-table"><caption className="sr-only">Team statistics for {scope === 'match' ? 'the whole match' : scope.replace('_',' ')}</caption><thead><tr><th scope="col">Pair 1</th><th scope="col">Statistic</th><th scope="col">Pair 2</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.values[0] ?? '—'}</td><th scope="row">{row.label}</th><td>{row.values[1] ?? '—'}</td></tr>)}</tbody></table></div> : <p className="pro-coverage">The provider has no statistics for this {scope === 'match' ? 'match' : 'set'} yet.</p>}<p className="pro-coverage">Statistics belong to each pair. Rates are shown as percentages; counts are shown as numbers.</p>
    </> : <><p className="pro-coverage">Provider head-to-head history before {formatDate(match.playedAt)}. Pair line-ups are shown for every meeting.</p>{state.data?.matches?.length ? <div className="pro-modal-results">{state.data.matches.map(result => <ResultCard key={result.id} match={result} playerLookup={playerLookup} playerHref={playerHref} />)}</div> : <p>No previous meetings reported.</p>}{state.data?.pages > 1 && <div className="pro-directory-pages"><button disabled={page === 1} onClick={() => setPage(page-1)}>Previous</button><span>Page {page} of {state.data.pages}</span><button disabled={page >= state.data.pages} onClick={() => setPage(page+1)}>Next</button></div>}</>}
  </section>;
}
