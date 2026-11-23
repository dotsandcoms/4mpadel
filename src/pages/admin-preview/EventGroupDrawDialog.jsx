import { useEffect, useId, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { drawTeamKey, groupSwapTargets, hasGroupPlayStarted } from '../../utils/drawGroupEditing.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';
import { useEventOperation } from './useEventOperation.js';
import {
  currentGroupQualification, latestUndoableGroupEdit, loadNativeGroupDraw, prepareGroupElimination, previewNativeGroupEdit,
} from './nativeGroupDraw.js';
import './EventPaymentDialog.css';

export default function EventGroupDrawDialog({ client, session, scopeId, event, division, draw, onClose, load = loadNativeGroupDraw, verifyAccess = verifyEventOperationAccess }) {
  const title = useId();
  const userId = session?.user?.id;
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [revision, setRevision] = useState(0);
  const [sourceId, setSource] = useState('');
  const [targetIndex, setTarget] = useState('');
  const [override, setOverride] = useState(null);
  const [reason, setReason] = useState('');
  const [review, setReview] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    load({ client, event, division, drawId: draw.id, expectedUserId: userId, scopeId, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setSnapshot(value); })
      .catch(failure => { if (!controller.signal.aborted) setLoadError(failure.message); });
    return () => controller.abort();
  }, [client, event, division, draw.id, userId, scopeId, load, revision]);

  const editable = snapshot && ['draft', 'published', 'in_progress'].includes(snapshot.draw.status)
    && snapshot.matches.every(match => match.stage === 'group');
  const sources = editable ? snapshot.groups.filter(group => !hasGroupPlayStarted(snapshot.matches, [group.id]))
    .flatMap(group => group.entries.map(entry => ({ entry, groupKey: group.id, position: group.name }))) : [];
  const source = sources.find(slot => String(drawTeamKey(slot.entry)) === sourceId);
  const targets = source ? groupSwapTargets(snapshot, source, Number(snapshot.draw.advancers_per_group) || 1) : [];
  const target = targetIndex === '' ? null : targets[Number(targetIndex)];
  const undo = editable ? latestUndoableGroupEdit(snapshot) : null;
  const qualification = snapshot ? currentGroupQualification(snapshot) : null;

  function reviewGroupEdit(from, to, undoOf) {
    setReviewError('');
    try {
      const { args, warnings } = previewNativeGroupEdit(snapshot, from, to);
      setReview({
        scope: 'edit', args: { ...args, p_undo: undoOf || null }, warnings,
        title: undoOf ? 'Undo last group edit' : to.entry ? 'Swap group teams' : 'Move team to another group',
        summary: to.entry ? `${from.entry.team_name} ↔ ${to.entry.team_name}` : `${from.entry.team_name} → ${to.position}`,
      });
    } catch (failure) { setReviewError(failure.message); }
  }

  function reviewQualification() {
    const updated = override ? currentGroupQualification(snapshot, override) : qualification;
    if (!updated || (override && (override.length !== qualification.autoIds.length || !reason.trim()))) return;
    setReview({
      scope: 'qualify', args: prepareGroupElimination(snapshot, updated, override ? reason.trim() : null),
      title: 'Create elimination phase', summary: updated.advancing.map(team => team.team_name).join(', '), warnings: [],
    });
  }

  function save(formEvent) {
    formEvent.preventDefault();
    if (!review) return;
    run(async ({ isCurrent, onAttempt }) => {
      await verifyAccess({ client, eventId: event.id, expectedUserId: userId, scopeId });
      if (!isCurrent()) throw new Error('The event workspace changed.');
      onAttempt();
      const { data, error: saveError } = await client.rpc(review.scope === 'edit' ? 'native_apply_group_edit' : 'native_create_group_elimination', review.args);
      if (saveError) throw saveError;
      return review.scope === 'qualify' ? 'Elimination phase created.' :
        Number(data) > 0 ? `Updated group fixtures. ${data} court bookings need reassignment.` : 'Groups and fixtures updated.';
    });
  }

  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{division.name || division.division_name}</p><h2 id={title}>Group draw</h2></div>
      <button type="button" className="ap-icon-button" disabled={busy} onClick={close} aria-label="Close group draw">×</button>
    </header>
    <form onSubmit={save}>
      {loadError ? <><p role="alert">{loadError}</p><button type="button" className="ap-secondary" onClick={() => { setLoadError(''); setRevision(value => value + 1); }}>Retry draw</button></> :
        !snapshot ? <p role="status">Loading group teams and fixtures…</p> :
        result ? <p role="status">{result}</p> :
        review ? <><h3>{review.title}</h3><p>{review.summary}</p>{review.warnings.length > 0 && <ul>{review.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
          {review.scope === 'edit' && <p className="ap-payment-live-note">Fixtures are updated together. Affected bookings may need new court times.</p>}
          {error && <p role="alert">{error}</p>}
        </> : <>
          {snapshot.groups.map(group => <section key={group.id} aria-label={group.name} className="ap-entry-payment-summary">
            <strong>{group.name}</strong><p>{group.entries.map(entry => entry.team_name).join(', ') || 'No teams recorded'}</p>
          </section>)}
          {sources.length > 0 && <><label>Team to move<SearchableDropdown value={sourceId} onChange={event => { setSource(event.target.value); setTarget(''); }}>
            <option value="">Choose a team</option>{sources.map(slot => <option key={slot.entry.id} value={slot.entry.id}>{slot.position} · {slot.entry.team_name}</option>)}
          </SearchableDropdown></label>
          {source && <label>Destination group or team<SearchableDropdown value={targetIndex} onChange={event => setTarget(event.target.value)}>
            <option value="">Choose a destination</option>{targets.map((slot, index) => <option key={`${slot.groupKey}:${slot.entry?.id}`} value={index}>{slot.position} · {slot.entry ? `Swap with ${slot.entry.team_name}` : 'Open place'}</option>)}
          </SearchableDropdown></label>}
          <button type="button" className="ap-secondary" disabled={!target} onClick={() => reviewGroupEdit(source, target)}>Review group change</button></>}
          {undo && <button type="button" className="ap-secondary" onClick={() => reviewGroupEdit(undo.source, undo.target, undo.undoOf)}>Review undo</button>}
          {qualification && <section className="ap-entry-payment-summary" aria-label="Group qualification">
            <strong>Review qualifiers</strong><p>{qualification.advancing.map(team => team.team_name).join(', ')}</p>
            {qualification.comparison.length > 0 && <fieldset><legend>Best-placed teams</legend>
              {qualification.comparison.map(team => <label key={team.entry_id}><input type="checkbox" checked={(override || qualification.autoIds).includes(team.entry_id)}
                onChange={event => { const ids = override || qualification.autoIds; setOverride(event.target.checked ? [...ids, team.entry_id] : ids.filter(id => id !== team.entry_id)); }} />{team.team} · {team.group} · {team.won} won</label>)}
            </fieldset>}
            {override && <label>Reason for overriding qualifiers<textarea value={reason} onChange={event => setReason(event.target.value)} required /></label>}
            <button type="button" className="ap-secondary" disabled={Boolean(override && (override.length !== qualification.autoIds.length || !reason.trim()))} onClick={reviewQualification}>Review elimination phase</button>
          </section>}
          {reviewError && <p role="alert">{reviewError}</p>}
        </>}
      <footer>
        {review && !result && <button className="ap-secondary" type="button" disabled={busy || Boolean(error)} onClick={() => setReview(null)}>Back to groups</button>}
        <button className="ap-secondary" type="button" disabled={busy} onClick={close}>{result ? 'Done' : 'Close'}</button>
        {review && !result && <button type="submit" className="ap-primary" disabled={busy || Boolean(error)}>{busy ? 'Saving…' : 'Confirm'}</button>}
      </footer>
    </form>
  </dialog>;
}
