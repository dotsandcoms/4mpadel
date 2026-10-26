import React, { useEffect, useRef, useState } from 'react';
import ClubCreateWizard from '../../components/clubs/ClubCreateWizard';
import { Dialog } from './PlayersWorkspace';
import RecordLoading from './RecordLoading';
import { verifyClubCreationAccess } from './clubCreation';
import './CreateClubDialog.css';

export default function CreateClubDialog({ client, scopeId, session, onClose, onComplete, onOpenExisting }) {
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false);
  const active = useRef(false), locked = useRef(false), dirty = useRef(false), created = useRef(null);
  useEffect(() => {
    let cancelled = false;
    active.current = true;
    verifyClubCreationAccess(client, scopeId, session?.user?.id)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; active.current = false; };
  }, [client, scopeId, session?.user?.id]);
  useEffect(() => {
    const warn = event => {
      if ((!dirty.current && !locked.current) || created.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const close = () => {
    if (locked.current) return;
    if (created.current) { onComplete(created.current); return; }
    if (dirty.current) setDiscard(true);
    else onClose();
  };
  const beforeWrite = async () => {
    if (!active.current) throw new Error('This club editor is no longer active.');
    if (created.current) throw new Error('This club has already been created. Open its profile to edit it.');
    await verifyClubCreationAccess(client, scopeId, session?.user?.id);
    if (!active.current) throw new Error('This club editor is no longer active.');
  };
  return <Dialog title="Create club" kicker="Network / Clubs" onClose={close} busy={busy} className="clubs-create-dialog">
    <div className="clubs-create-body">
      {error && <p role="alert" className="clubs-create-error">{error}</p>}
      {!ready && !error && <RecordLoading label="Checking club creation access…"/>}
      {discard && <section className="clubs-create-discard" role="alert"><h3>Discard this club setup?</h3><p>This closes the form without publishing again. Images already uploaded remain in storage. If publishing failed, refresh the directory to check whether the club was created before retrying.</p><div className="pp-actions"><button className="ap-secondary" onClick={() => setDiscard(false)}>Keep editing</button><button className="ap-danger" onClick={onClose}>Discard setup</button></div></section>}
      {ready && <div hidden={discard}>
        <p className="clubs-create-notice">Publishing creates a verified, public club, as in the live admin. It does not grant memberships or send application emails. Images upload when selected.</p>
        <ClubCreateWizard mode="admin" embedded theme="preview" client={client}
          beforeWrite={beforeWrite}
          onDirtyChange={value => { dirty.current = value; }}
          onBusyChange={value => { locked.current = value; if (active.current) setBusy(value); }}
          onCreated={record => { created.current = record; }}
          onComplete={record => { if (active.current) onComplete(record); }}
          onOpenExisting={id => { if (active.current && !locked.current && onOpenExisting(id) === false) setError('That club is not in the loaded directory. Close creation and refresh clubs to load it.'); }}/>
      </div>}
    </div>
  </Dialog>;
}
