import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { loadAccessAlbums } from './permissionsData';

export default function GalleryAlbumAccess({ client, selected, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [state, setState] = useState({ albums: [], loading: true, error: '' });
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    loadAccessAlbums(client, controller.signal).then(albums => {
      if (!controller.signal.aborted) setState({ albums, loading: false, error: '' });
    }).catch(error => { if (!controller.signal.aborted) setState({ albums: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, [client, open, retry]);
  const rows = editing ? state.albums.filter(album => `${album.title} ${album.id}`.toLowerCase().includes(query.trim().toLowerCase())) : selected.map(id => state.albums.find(album => String(album.id) === String(id)) || { id });
  const pages = Math.max(1, Math.ceil(rows.length / 4));
  const currentPage = Math.min(page, pages);
  const toggle = id => {
    if (selected.some(value => String(value) === String(id))) {
      if (selected.length === 1) { setConfirmClear(true); return; }
      onChange(selected.filter(value => String(value) !== String(id)));
    } else onChange([...selected, id]);
  };
  return <details className="ax-action-group" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Gallery album access<span>{selected.length ? `${selected.length} assigned` : 'Default rules'}</span></summary>
    {open && <div className="ax-finance-events">
      <p>{selected.length ? `Restricted to ${selected.length} selected albums in the stored settings.` : 'No specific album restriction is set. This does not mean no Gallery access.'} Super admins bypass album restrictions. Backend access checks still apply.</p>
      {disabled && <p>Editing requires a super-admin operator, a custom user role and Gallery enabled.</p>}
      {state.loading ? <p role="status">Loading album titles…</p> : state.error ? <div role="alert"><p>Albums could not be loaded. Existing selections are preserved.</p><button type="button" className="ap-secondary" onClick={() => { setState({ albums: [], loading: true, error: '' }); setRetry(value => value + 1); }}>Retry albums</button></div> : <>
        <button type="button" className="ap-secondary" disabled={disabled} onClick={() => { setEditing(value => !value); setQuery(''); setPage(1); setConfirmClear(false); }}>{editing ? 'Done · show assigned albums' : 'Edit album access'}</button>
        {editing && <label className="ax-search"><Search size={16} aria-hidden="true" /><input aria-label="Find an album" placeholder="Find an album by title or ID" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>}
        {confirmClear && <div className="ax-summary" role="alert"><b>Remove the last album restriction?</b><p>An empty list uses the live module’s unrestricted album selection. To remove Gallery access, disable the Gallery module instead.</p><div className="ax-actions"><button type="button" className="ap-secondary" onClick={() => setConfirmClear(false)}>Keep restriction</button><button type="button" className="ap-secondary" disabled={disabled} onClick={() => { onChange([]); setConfirmClear(false); }}>Remove restriction in draft</button></div></div>}
        <div className="ax-events ax-picker-results">{rows.slice((currentPage - 1) * 4, currentPage * 4).map(album => editing ? <label key={album.id}><input type="checkbox" disabled={disabled || confirmClear} checked={selected.some(id => String(id) === String(album.id))} onChange={() => toggle(album.id)} /><span><b className="ax-policy-event-title">{album.title || `Album #${album.id}`}</b><small>Album #{album.id}</small></span></label> : <div className="ax-membership" key={album.id}><span><b>{album.title || `Album #${album.id}`}</b><small>{!album.title ? 'Details unavailable · assignment preserved' : `Album #${album.id}`}</small></span><span className="ap-status ap-status--info">Assigned</span></div>)}</div>
        {!rows.length && editing && <p role="status">No matching albums.</p>}
        {rows.length > 0 && <nav className="ax-pagination" aria-label="Album access pages"><span role="status">Showing {(currentPage - 1) * 4 + 1}–{Math.min(currentPage * 4, rows.length)} of {rows.length} albums · Page {currentPage} of {pages}</span><button type="button" className="ap-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="ap-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
      </>}
    </div>}
  </details>;
}
