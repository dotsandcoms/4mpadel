import { Fragment, useEffect, useRef, useState } from 'react';
import RecordLoading from './RecordLoading.jsx';
import { reviewClubGoogleUnlink } from './clubGoogleUnlink.js';

const labels = {
  google_place_id: 'Google Place ID', google_maps_url: 'Google Maps link', google_rating: 'Google rating',
  google_ratings_total: 'Google review count', google_synced_at: 'Google sync date',
  address: 'Address', city: 'City', province: 'Province', country: 'Country', lat: 'Latitude', lng: 'Longitude',
  website_url: 'Website', contact_phone: 'Phone', opening_hours: 'Opening hours',
  cover_image_url: 'Cover image', gallery: 'Gallery photos',
};
const fieldValue = value => {
  if (value == null || (typeof value === 'object' && !Object.keys(value).length)) return 'None';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

export default function ClubGoogleUnlinkReview({ client, scopeId, userId, row, decision, placeId,
  onClose, onUnlinked, onOpenClub }) {
  const [state, setState] = useState({ loading: true });
  const [revision, reload] = useState(0);
  const confirmRequest = useRef(null);
  useEffect(() => () => confirmRequest.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    reviewClubGoogleUnlink({ client, scopeId, userId, row, decision, placeId, signal: controller.signal })
      .then(review => { if (!controller.signal.aborted) setState({ review }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [client, scopeId, userId, row, decision, placeId, revision]);

  const confirm = async () => {
    if (confirmRequest.current || state.review?.status !== 'review') return;
    const controller = new AbortController();
    confirmRequest.current = controller;
    setState(previous => ({ ...previous, busy: true }));
    try {
      const result = await reviewClubGoogleUnlink({
        client, scopeId, userId, row, decision, placeId, review: state.review, signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setState({ done: true });
        onUnlinked?.(result);
      }
    } catch (error) {
      if (!controller.signal.aborted) setState({ error: error.message });
    } finally {
      if (confirmRequest.current === controller) confirmRequest.current = null;
    }
  };
  const review = state.review;
  return <section className="ap-section clubs-management" aria-label={decision === 'conflict' ? 'Review conflicting Google listing' : 'Review Google delist'}>
    <h3>{decision === 'conflict' ? 'Conflicting Google listing' : 'Remove Google link'}</h3>
    {state.loading && <RecordLoading label="Checking the current Google link…"/>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.done && <p role="status">Google listing unlinked.</p>}
    {review?.status === 'available' && <p role="status">This listing is available. Return to the match to review applying it.</p>}
    {review?.status === 'review' && <>
      <p>{decision === 'conflict' ? `${review.target.name} currently holds the listing proposed for ${review.source.name}.`
        : `This unlinks the Google listing for ${review.target.name}.`}</p>
      <dl className="clubs-fields">{Object.entries(review.patch).map(([field,value]) => <Fragment key={field}>
        <dt>{labels[field] || field}</dt><dd>{fieldValue(review.before[field])} → {fieldValue(value)}</dd>
      </Fragment>)}</dl>
      {review.preserved?.length > 0 && <p>Kept on the club profile · {review.preserved.map(field => labels[field] || field).join(', ')}</p>}
      {decision === 'conflict' && <p>{review.source.name} stays pending until you review applying the listing.</p>}
    </>}
    <div className="fo-report-actions">
      <button className="ap-secondary" type="button" disabled={state.busy} onClick={onClose}>Back to match</button>
      {state.error && <button className="ap-secondary" type="button" onClick={() => { setState({ loading: true }); reload(value => value + 1); }}>Reload unlink review</button>}
      {review?.status === 'review' && <>
        {onOpenClub && <button className="ap-secondary" type="button" disabled={state.busy} onClick={() => onOpenClub(review.target)}>Open {review.target.name} profile</button>}
        {onOpenClub && decision === 'conflict' && <button className="ap-secondary" type="button" disabled={state.busy}
          onClick={() => onOpenClub(review.source, { mergeTarget: review.target })}>Review merging {review.source.name} into {review.target.name}</button>}
        <button className="ap-danger-button" type="button" disabled={state.busy} onClick={confirm}>
          {state.busy ? 'Unlinking…' : `Unlink listing from ${review.target.name}`}
        </button>
      </>}
    </div>
  </section>;
}
