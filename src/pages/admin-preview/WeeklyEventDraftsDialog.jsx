import { useEffect, useRef, useState } from 'react';
import { Dialog } from './PlayersWorkspace';
import { dateLabel } from './playersData';
import { weeklyEventDraftRequest } from '../../utils/weeklyEventDrafts';
import RecordLoading from './RecordLoading';
import './CalendarWorkspace.css';

export default function WeeklyEventDraftsDialog({ client, host, onClose, onOpen }) {
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revision, reload] = useState(0);
  const request = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setDrafts(null);
    setError('');
    weeklyEventDraftRequest(client, 'list', { host, signal: controller.signal })
      .then(setDrafts).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [client, host, revision]);

  const act = async (action, draft) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await weeklyEventDraftRequest(client, action, { host, id: draft.id, revision: draft.revision, signal: controller.signal });
      if (action === 'load') {
        onOpen(result);
      } else {
        setDiscard(null);
        reload(value => value + 1);
      }
    } catch (problem) {
      if (!controller.signal.aborted) setError(problem.message);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <Dialog title="Weekly drafts" onClose={() => { if (!busy) onClose(); }}>
    <div className="cw-panel" aria-busy={busy}>
      {error && <p role="alert">{error} <button className="ap-text-button" type="button" onClick={() => { setDiscard(null); reload(value => value + 1); }}>Reload drafts</button></p>}
      {!drafts && !error && <RecordLoading label="Loading weekly drafts…"/>}
      {drafts?.length === 0 && <p>No weekly drafts to continue.</p>}
      {drafts?.map(draft => <div className="cw-weekly-draft" key={draft.id}>
        <div><strong>{draft.name}</strong><small>{dateLabel(draft.start_date)} · {draft.weeks} weeks</small></div>
        {discard?.id === draft.id ? <div className="cw-actions">
          <button type="button" className="ap-secondary" disabled={busy} onClick={() => setDiscard(null)}>Keep draft</button>
          <button type="button" className="ap-danger-button" disabled={busy} onClick={() => act('discard', draft)}>Confirm discard</button>
        </div> : <div className="cw-actions">
          <button type="button" className="ap-primary" disabled={busy || Boolean(discard)} aria-label={`Continue ${draft.name}`} onClick={() => act('load', draft)}>Continue draft</button>
          <button type="button" className="ap-secondary" disabled={busy || Boolean(discard)} aria-label={`Discard ${draft.name}`} onClick={() => setDiscard(draft)}>Discard</button>
        </div>}
      </div>)}
    </div>
  </Dialog>;
}
