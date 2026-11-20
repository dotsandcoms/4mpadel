import { useEffect, useRef, useState } from 'react';
import { findClubGooglePlaces, googleMapsReviewLink, selectClubGooglePlace } from './clubGoogleManual.js';

export default function ClubGoogleManualMatch({ client, scopeId, userId, row, busy, onReview, onCancel }) {
  const [query, setQuery] = useState(() => [row.clubs.name,'padel',row.clubs.city,'South Africa'].filter(Boolean).join(' '));
  const [link, setLink] = useState('');
  const [state, setState] = useState({});
  const active = useRef(null);
  const blocked = busy || state.loading;
  useEffect(() => () => active.current?.abort(), []);

  const run = async action => {
    if (busy || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState(previous => ({...previous,loading:true,error:''}));
    try {
      await action({client,scopeId,userId,signal:controller.signal});
    } catch (error) {
      if (!controller.signal.aborted) setState(previous => ({...previous,error:error.message}));
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setState(previous => ({...previous,loading:false}));
    }
  };
  const search = async event => {
    event.preventDefault();
    await run(async context => {
      const results = await findClubGooglePlaces(context,query);
      if (!context.signal.aborted) setState({results});
    });
  };
  const reviewLink = event => {
    event.preventDefault();
    const url = googleMapsReviewLink(link);
    if (!url) { setState(previous => ({...previous,error:'Paste a complete HTTPS Google Maps link.'})); return; }
    void onReview({kind:'link',url});
  };

  return <div className="clubs-management">
    <div className="fo-report-actions"><button className="ap-secondary" type="button" disabled={blocked} onClick={onCancel}>Back to match</button></div>
    {state.error && <p role="alert">{state.error}</p>}
    <form onSubmit={search}>
      <label className="fo-search">Search Google Places<input type="search" value={query} maxLength={160} disabled={blocked}
        onChange={event => { setQuery(event.target.value); setState({}); }}/></label>
      <button className="ap-secondary" type="submit" disabled={blocked || query.trim().length < 2}>Search places</button>
    </form>
    {state.results?.length === 0 && <p role="status">Google returned no places for this search.</p>}
    {!!state.results?.length && <ul className="clubs-management-list">{state.results.map(place => <li key={place.id}>
      <div><strong>{place.name}</strong><p>{place.address}</p></div>
      <button className="ap-secondary" type="button" disabled={blocked} onClick={() => run(async context => {
        const candidate = await selectClubGooglePlace(context,place.id);
        if (!context.signal.aborted) await onReview(candidate);
      })}>Review {place.name}</button>
    </li>)}</ul>}
    <form onSubmit={reviewLink}>
      <label className="fo-search">Google Maps link<input type="url" value={link} disabled={blocked} maxLength={2048}
        onChange={event => { setLink(event.target.value); setState(previous => ({...previous,error:''})); }}/></label>
      <button className="ap-secondary" type="submit" disabled={blocked || !link.trim()}>Review pasted link</button>
    </form>
  </div>;
}
