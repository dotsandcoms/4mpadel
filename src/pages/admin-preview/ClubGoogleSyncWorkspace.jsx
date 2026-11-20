import { useEffect, useRef, useState } from 'react';
import RecordLoading from './RecordLoading.jsx';
import SearchableDropdown from '../../components/SearchableDropdown';
import ClubGoogleManualMatch from './ClubGoogleManualMatch.jsx';
import ClubGoogleScan from './ClubGoogleScan.jsx';
import ClubGoogleUnlinkReview from './ClubGoogleUnlinkReview.jsx';
import { googleMapsReviewLink } from './clubGoogleManual.js';
import { isGoogleLinked, loadClubGoogleMatches, matchLabels, reviewClubGoogleMatch } from './clubGoogleSync.js';

const labels = {
  address: 'Address', city: 'City', province: 'Province', country: 'Country', lat: 'Latitude', lng: 'Longitude',
  website_url: 'Website', contact_phone: 'Phone', opening_hours: 'Opening hours', cover_image_url: 'Cover image',
  gallery: 'Gallery photos', google_place_id: 'Google Place ID', google_maps_url: 'Google Maps link',
  google_rating: 'Google rating', google_ratings_total: 'Google review count',
};
const perPage = 12;
const fieldValue = value => value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'Not recorded');

export default function ClubGoogleSyncWorkspace({ client, session, scopeId, onOpenClub }) {
  const userId = session?.user?.id;
  const [list, setList] = useState({ loading: true });
  const [revision, reload] = useState(0);
  const [filter, setFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const actionRequest = useRef(null);
  useEffect(() => () => actionRequest.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    loadClubGoogleMatches({ client, scopeId, userId, signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) setList({ rows }); })
      .catch(error => { if (!controller.signal.aborted) setList({ error: error.message }); });
    return () => controller.abort();
  }, [client, scopeId, userId, revision]);

  const reloadMatches = () => {
    setList({ loading: true });
    reload(value => value + 1);
  };
  const refresh = () => {
    setSelected(null);
    reloadMatches();
  };
  const proceed = async (decision, review, candidate) => {
    if (actionRequest.current || !selected?.row) return;
    const controller = new AbortController();
    actionRequest.current = controller;
    setBusy(true);
    setSelected(previous => ({ ...previous, error: '' }));
    try {
      const result = await reviewClubGoogleMatch({ client, scopeId, userId, row: selected.row, decision, review, candidate, signal: controller.signal });
      if (!review) {
        setSelected({ row: selected.row, review: result, candidate, manual: Boolean(candidate) });
      } else {
        setFeedback(candidate?.kind === 'link' ? 'Google Maps link saved.' : decision === 'apply' ? 'Google match applied.' : 'Google match dismissed.');
        refresh();
      }
    } catch (error) {
      if (!controller.signal.aborted) setSelected(previous => ({
        ...previous, review: null, error: error.message,
        ...(error.code === '23505' ? { manual: false, conflicting: true, candidate } : {}),
      }));
    } finally {
      if (actionRequest.current === controller) actionRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const rows = (list.rows || []).filter(row => filter === 'applied' ? isGoogleLinked(row.clubs)
    : !isGoogleLinked(row.clubs) && row.review_status === 'pending' && (filter === 'pending' || row.match_status === filter));
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages);
  const selectedLinked = isGoogleLinked(selected?.row.clubs);
  const pending = !selectedLinked && selected?.row.review_status === 'pending';
  const conflicting = pending && !selected.resolved && (selected.conflicting || selected.row.match_status === 'conflict');
  const changingMatch = busy || Boolean(selected?.unlink);
  return <section className="ap-section clubs-management" aria-label="Google Sync">
    <div className="ap-section-heading"><div><h2>Google Sync</h2><p>Find and review Google listings for clubs.</p></div>
      <button className="ap-secondary" type="button" disabled={changingMatch || list.loading} onClick={refresh}>Reload matches</button></div>
    <ClubGoogleScan client={client} scopeId={scopeId} userId={userId} disabled={changingMatch || list.loading} onScanned={reloadMatches} />
    {feedback && <p role="status">{feedback}</p>}
    {list.loading ? <RecordLoading label="Loading Google matches…"/> : list.error ? <p role="alert">{list.error}</p> : <>
      <label className="fo-status-filter">Match status<SearchableDropdown disabled={changingMatch} value={filter}
        onChange={event => { setFilter(event.target.value); setPage(1); setSelected(null); }}>
        <option value="pending">All pending</option>{Object.entries(matchLabels).map(([id,label]) => <option value={id} key={id}>{label}</option>)}
        <option value="applied">Applied</option>
      </SearchableDropdown></label>
      <div className="fo-table-scroll"><table className="fo-detail-table"><thead><tr><th scope="col">Club</th><th scope="col">Google listing</th>
        <th scope="col">Match</th><th scope="col">Review</th></tr></thead><tbody>{rows.slice((current-1)*perPage,current*perPage).map(row =>
          <tr key={row.id}><td>{row.clubs.name}<small>{row.clubs.city}</small></td><td>{row.google_name || 'No recorded listing'}<small>{row.google_address}</small></td>
            <td>{isGoogleLinked(row.clubs) ? 'Applied' : matchLabels[row.match_status] || row.match_status}
              {row.conflict_note && <small>{row.conflict_note}</small>}</td>
            <td><button className="ap-secondary" type="button" disabled={changingMatch} onClick={() => setSelected({row})}>Review {row.clubs.name}</button></td></tr>)}</tbody></table></div>
      {!rows.length && <p role="status">No matches in this view.</p>}
      {pages > 1 && <nav className="fo-pagination" aria-label="Google match pages"><button className="ap-secondary" disabled={changingMatch || current <= 1} onClick={() => setPage(current-1)}>Previous</button>
        <span>Page {current} of {pages}</span><button className="ap-secondary" disabled={changingMatch || current >= pages} onClick={() => setPage(current+1)}>Next</button></nav>}
    </>}
    {selected?.unlink && <ClubGoogleUnlinkReview client={client} scopeId={scopeId} userId={userId} row={selected.row}
      decision={selected.unlink} placeId={selected.candidate?.place_id} onOpenClub={onOpenClub}
      onClose={() => setSelected(previous => ({ ...previous, unlink: null }))}
      onUnlinked={result => {
        setFeedback(`Google listing unlinked from ${result.target.name}.`);
        if (selected.unlink === 'conflict') {
          setSelected({ row: selected.row, candidate: selected.candidate, resolved: true });
          reloadMatches();
        } else refresh();
      }} />}
    {selected && !selected.unlink && <section className="ap-section" aria-label="Google match review">
      <h3>{selected.row.clubs.name}</h3>
      <p>{selected.row.google_name || 'No Google listing recorded'}{selected.row.google_address ? ` · ${selected.row.google_address}` : ''}</p>
      {googleMapsReviewLink(selected.row.clubs.google_maps_url) && <a href={selected.row.clubs.google_maps_url} target="_blank" rel="noreferrer">Open Google Maps</a>}
      {selected.error && <p role="alert">{selected.error}</p>}
      {selected.manual && !selected.review && <ClubGoogleManualMatch key={selected.row.id} client={client}
        scopeId={scopeId} userId={userId} busy={busy} row={selected.row}
        onReview={candidate => proceed('apply', null, candidate)} onCancel={() => setSelected({ row: selected.row })} />}
      {selected.review && <>
        {selected.candidate?.kind === 'place' && <p>{selected.candidate.name}{selected.candidate.address ? ` · ${selected.candidate.address}` : ''}</p>}
        <h4>{selected.review.decision === 'apply' ? 'Review field changes' : 'Dismiss this Google match?'}</h4>
        {selected.review.decision === 'apply' ? <dl>{Object.entries(selected.review.patch || {}).map(([key,value]) => <div key={key}>
          <dt>{labels[key] || key}</dt><dd><span>Current · {fieldValue(selected.review.before?.[key])}</span>
            <p>Proposed · {fieldValue(value)}</p></dd>
        </div>)}</dl> : <p>The match leaves the pending queue. The club profile stays as recorded.</p>}
      </>}
      <div className="fo-report-actions"><button className="ap-secondary" disabled={busy} onClick={() => setSelected(null)}>Close review</button>
        {onOpenClub && <button className="ap-secondary" type="button" disabled={busy} onClick={() => onOpenClub(selected.row.clubs)}>Open club profile</button>}
        {selectedLinked && <button className="ap-secondary" type="button" disabled={busy} onClick={() => setSelected(previous => ({ ...previous, unlink: 'delist' }))}>Delist Google listing</button>}
        {pending && (selected.review
          ? <button className="ap-primary" disabled={busy} onClick={() => proceed(selected.review.decision, selected.review, selected.candidate)}>
            {selected.candidate?.kind === 'link' ? 'Confirm Google Maps link' : selected.review.decision === 'apply' ? 'Confirm Google match' : 'Confirm dismissal'}</button>
          : !selected.manual && <>
            {conflicting && <button className="ap-secondary" type="button" disabled={busy}
              onClick={() => setSelected(previous => ({ ...previous, unlink: 'conflict' }))}>Review conflicting Google listing</button>}
            <button className="ap-secondary" disabled={busy} onClick={() => setSelected({ row: selected.row, manual: true })}>Find Google match</button>
            <button className="ap-secondary" disabled={busy} onClick={() => proceed('dismiss')}>Review dismissal</button>
            {selected.candidate?.kind === 'place' ? <button className="ap-primary" disabled={busy}
              onClick={() => proceed('apply', null, selected.candidate)}>Review selected listing</button>
              : selected.row.google_place_id && <button className="ap-primary" disabled={busy} onClick={() => proceed('apply')}>Review field changes</button>}
          </>)}
      </div>
    </section>}
  </section>;
}
