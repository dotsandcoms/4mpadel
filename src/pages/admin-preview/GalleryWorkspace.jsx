import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import SearchableDropdown from '../../components/SearchableDropdown';
import RecordLoading from './RecordLoading';
import { canReadGallery, loadGallery, loadGalleryPhotos, galleryAlbumDraft, galleryAlbumPayload, gallerySlug, galleryImageUrl, filterGallery, prepareGalleryFiles, permittedAlbumIds } from './galleryData';
import './GalleryWorkspace.css';
import { galleryMutationApi } from './galleryMutations.js';
function Thumbnail({
  src,
  alt = '',
  local = false
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const safe = galleryImageUrl(src, local);
  return safe && !failed ? <img src={safe} alt={alt} width="480" height="320" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="gw-empty-image">No image available</span>;
}
function GalleryDialog({
  title,
  onClose,
  children
}) {
  const ref = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => {
      ref.current?.close();
      previous?.focus?.();
    };
  }, []);
  return <dialog className="gw-dialog" ref={ref} aria-label={title} onCancel={e => {
    e.preventDefault();
    close.current();
  }}><header><h2>{title}</h2><button type="button" className="ap-secondary" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</dialog>;
}
function AlbumEditor({
  album,
  albums,
  events,
  organisations,
  onClose,
  onApply,
  persistent=false,
  busy=false,
  blocked=false,
  saveError=''
}) {
  const [draft, setDraft] = useState(() => galleryAlbumDraft(album)),
    [review, setReview] = useState(null),
    [error, setError] = useState(''),
    [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(galleryAlbumDraft(album));
  const close = () => { if(!busy) dirty ? setDiscard(true) : onClose(); };
  const field = (key, label, type = 'text') => <label>{label}<input type={type} value={draft[key]} onChange={e => setDraft(d => ({
      ...d,
      [key]: e.target.value
    }))} /></label>;
  const select = (key, label, rows, name) => <label>{label}<SearchableDropdown value={draft[key]} onChange={e => setDraft(d => ({
      ...d,
      [key]: e.target.value
    }))}><option value="">None</option>{draft[key] && !rows.some(r => String(r.id) === String(draft[key])) && <option value={draft[key]}>Current linked record ({draft[key]})</option>}{rows.map(r => <option key={r.id} value={r.id}>{r[name]}</option>)}</SearchableDropdown></label>;
  return <GalleryDialog title={album ? 'Edit album' : 'Create album'} onClose={close}>{discard ? <section className="gw-body"><h3>Discard album changes?</h3><p>Nothing has been saved to the database.</p><div className="gw-actions"><button className="ap-secondary" onClick={() => setDiscard(false)}>Keep editing</button><button className="ap-danger" onClick={onClose}>Discard changes</button></div></section> : <form onSubmit={e => {
      e.preventDefault();
      try {
        setReview(galleryAlbumPayload(draft));
        setError('');
      } catch (err) {
        setError(err.message);
      }
    }}><section className="gw-body"><p className="gw-notice">{persistent ? 'Review carefully. Confirming writes these album fields to staging.' : 'Local draft only. Review the source album fields; applying updates this browser preview, not the live gallery.'}</p>{review ? <><h3>Review album</h3><dl className="gw-review">{Object.entries(review).map(([key, value]) => <React.Fragment key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value ?? 'None')}</dd></React.Fragment>)}</dl></> : <div className="gw-fields">{field('title', 'Album title')}{field('album_date', 'Album date', 'date')}{field('slug', 'URL slug')}<button type="button" className="ap-secondary" onClick={() => setDraft(d => ({
            ...d,
            slug: gallerySlug(d.title)
          }))}>Generate slug from title</button><label className="gw-wide">Description<textarea value={draft.description} onChange={e => setDraft(d => ({
              ...d,
              description: e.target.value
            }))} /></label>{select('parent_album_id', 'Parent album', albums.filter(a => a.id !== album?.id), 'title')}{select('event_id', 'Linked event', events, 'event_name')}{select('organisation_id', 'Linked organisation', organisations, 'name')}{field('youtube_playlist_url', 'YouTube playlist URL', 'url')}{field('photographer_name', 'Photographer name')}{field('photographer_instagram', 'Instagram handle')}{field('cover_image_url', 'Cover image URL', 'url')}<div className="gw-cover-preview"><Thumbnail src={draft.cover_image_url} /></div>{['is_active', 'is_featured'].map(key => <label className="gw-check" key={key}><input type="checkbox" checked={!!draft[key]} onChange={e => setDraft(d => ({
              ...d,
              [key]: e.target.checked
            }))} />{key === 'is_active' ? 'Active / publicly visible' : 'Featured album'}</label>)}</div>}{(error || saveError) && <p role="alert">{error || saveError}</p>}</section><footer className="gw-actions">{review ? <><button type="button" className="ap-secondary" disabled={busy} onClick={() => setReview(null)}>Back to editing</button><button type="button" className="ap-primary" disabled={busy||blocked} onClick={() => onApply(review)}>{busy ? 'Saving…' : persistent ? 'Save album to staging' : 'Apply local album draft'}</button></> : <><button type="button" className="ap-secondary" onClick={close}>Cancel</button><button className="ap-primary">Review album</button></>}</footer></form>}</GalleryDialog>;
}
export default function GalleryWorkspace({
  session,
  permissions,
  scopeId,
  client = supabase,
  refreshRevision = 0,
  mutationApi = galleryMutationApi
}) {
  const allowed = canReadGallery(session, permissions, scopeId),
    context = JSON.stringify([session?.user?.id, permissions, scopeId]);
  const [state, setState] = useState({
      loading: true
    }),
    [reload, setReload] = useState(0),
    [selected, setSelected] = useState(null),
    [photos, setPhotos] = useState({
      loading: false,
      rows: []
    }),
    [photoDrafts, setPhotoDrafts] = useState({});
  const [filters, setFilters] = useState({
      query: '',
      status: '',
      organisation: '',
      parent: ''
    }),
    [page, setPage] = useState(1),
    [photoPage, setPhotoPage] = useState(1),
    [editor, setEditor] = useState(null),
    [checked, setChecked] = useState([]),
    [viewer, setViewer] = useState(null),
    [action, setAction] = useState(null),
    [notice, setNotice] = useState(''),
    [changed, setChanged] = useState(false);
  const urls = useRef(new Set()),
    fileInput = useRef(null);
  const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[saveError,setSaveError]=useState('');
  const busyRef=useRef(false), currentContext=useRef(context);currentContext.current=context;
  const currentClient=useRef(client);currentClient.current=client;
  const currentAlbum=useRef(selected?.id);currentAlbum.current=selected?.id;
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const persistent=mutationApi.enabled(client);
  const runMutation=async work=>{
    if(busyRef.current||blocked)return;
    busyRef.current=true;setBusy(true);setSaveError('');
    const snapshot=context;
    const albumSnapshot=selected?.id;
    const isCurrent=()=>mounted.current&&currentContext.current===snapshot&&currentClient.current===client&&currentAlbum.current===albumSnapshot;
    try{await work({client,session,scopeId,isCurrent});}
    catch(error){if(isCurrent()){setBlocked(true);setSaveError(`${error.message} Reload the gallery to check the outcome before retrying.`);}}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  };
  const closeAction=()=>{
    if(busyRef.current)return;
    if(action?.kind==='upload')action.rows.forEach(row=>{URL.revokeObjectURL(row.image_url);urls.current.delete(row.image_url);});
    setAction(null);
  };
  const lastRefresh = useRef(refreshRevision);
  useEffect(() => {
    if (lastRefresh.current === refreshRevision) return;
    lastRefresh.current = refreshRevision;
    if(busyRef.current){setNotice('An operation is in progress. Refresh again when it finishes.');return;}
    if (changed || editor) setAction({
      kind: 'refresh'
    });else setReload(n => n + 1);
  }, [refreshRevision]);
  useEffect(() => {
    const controller = new AbortController();
    setSelected(null);
    setEditor(null);
    setViewer(null);
    setAction(null);
    setChecked([]);
    setPhotoDrafts({});
    setChanged(false);
    setBlocked(false);setSaveError('');
    setNotice('');
    urls.current.forEach(url => URL.revokeObjectURL(url));
    urls.current.clear();
    setState({
      loading: true,
      context
    });
    if (allowed) loadGallery(client, session, scopeId, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({
        ...data,
        context
      });
    }).catch(error => {
      if (!controller.signal.aborted) setState({
        error: error.message,
        context
      });
    });
    return () => controller.abort();
  }, [context, client, reload, allowed]);
  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    if (!changed) return;
    const warn = e => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);
  useEffect(() => {
    setChecked([]);
    setViewer(null);
    setPhotoPage(1);
    if (!selected) return;
    const controller = new AbortController();
    if (photoDrafts[selected.id]) {
      setPhotos({
        id: selected.id,
        rows: photoDrafts[selected.id]
      });
      return;
    }
    if (selected.local) {
      setPhotos({
        id: selected.id,
        rows: []
      });
      return;
    }
    setPhotos({
      id: selected.id,
      loading: true,
      rows: []
    });
    loadGalleryPhotos(client, session, scopeId, selected.id, controller.signal).then(rows => {
      if (!controller.signal.aborted) setPhotos({
        id: selected.id,
        rows
      });
    }).catch(error => {
      if (!controller.signal.aborted) setPhotos({
        id: selected.id,
        error: error.message,
        rows: []
      });
    });
    return () => controller.abort();
  }, [selected?.id, context, client]);
  const applyAlbum = payload => {
    if(persistent){return runMutation(async options=>{const original=editor.album;const row=await mutationApi.saveAlbum({...options,original,draft:payload,operationId:editor.operationId});if(!options.isCurrent())return;setState(s=>({...s,albums:original?s.albums.map(a=>a.id===row.id?row:a):[row,...s.albums]}));if(selected?.id===row.id)setSelected(row);setEditor(null);setNotice('Album saved to staging.');});}
    const row = {
      ...editor.album,
      ...payload,
      id: editor.album?.id || `local-album-${crypto.randomUUID()}`,
      created_at: editor.album?.created_at || new Date().toISOString(),
      local: editor.album?.local || !editor.album,
      localChanged: true
    };
    setState(s => ({
      ...s,
      albums: editor.album ? s.albums.map(a => a.id === row.id ? row : a) : [row, ...s.albums]
    }));
    if (selected?.id === row.id) setSelected(row);
    setChanged(true);
    setNotice('Album draft applied locally. The live gallery is unchanged.');
    setEditor(null);
  };
  const updatePhotos = rows => {
    setPhotos({
      id: selected.id,
      rows
    });
    setPhotoDrafts(d => ({
      ...d,
      [selected.id]: rows
    }));
    setChecked([]);
    setChanged(true);
  };
  const stageFiles = e => {
    try {
      const rows = prepareGalleryFiles(e.target.files, selected, photos.rows, url => {
        const value = URL.createObjectURL(url);
        urls.current.add(value);
        return value;
      });
      if (rows.length) setAction({
        kind: 'upload',
        rows
      });
    } catch (error) {
      setNotice(error.message);
    }
    e.target.value = '';
  };
  const confirm = () => {
    if(persistent){return runMutation(async options=>{
      if(action.kind==='upload'){const result=await mutationApi.uploadPhotos({...options,album:selected,files:action.rows.map(p=>p.file)});if(!options.isCurrent())return;setPhotos({id:selected.id,rows:[...photos.rows,...result.photos]});setSelected(result.album);setState(s=>({...s,albums:s.albums.map(a=>a.id===result.album.id?result.album:a)}));if(result.failures?.length){setBlocked(true);setSaveError(`${result.photos.length} photos registered; ${result.failures.length} issues. ${result.failures.map(f=>f.message).join(' ')} Reload before retrying.`);}}
      else if(action.kind==='photos'){await mutationApi.removePhotos({...options,album:selected,photos:photos.rows.filter(p=>action.ids.includes(p.id))});if(!options.isCurrent())return;setPhotos({id:selected.id,rows:photos.rows.filter(p=>!action.ids.includes(p.id))});setChecked([]);setViewer(null);}
      else if(action.kind==='cover'){const row=await mutationApi.setCover({...options,album:selected,photo:action.photo});if(!options.isCurrent())return;setSelected(row);setState(s=>({...s,albums:s.albums.map(a=>a.id===row.id?row:a)}));}
      else if(action.kind==='album'){await mutationApi.removeAlbum({...options,album:selected});if(!options.isCurrent())return;setState(s=>({...s,albums:s.albums.filter(a=>a.id!==selected.id)}));setSelected(null);}
      if(action.kind==='upload')action.rows.forEach(row=>{URL.revokeObjectURL(row.image_url);urls.current.delete(row.image_url);});
      setAction(null);setNotice('Staging operation finished; check any warnings above. Removed image records retain original storage files for recovery.');
    });}
    if (action.kind === 'upload') {
      updatePhotos([...photos.rows, ...action.rows]);
      if (!selected.cover_image_url && action.rows[0]) {
        const row = {
          ...selected,
          cover_image_url: action.rows[0].image_url,
          localChanged: true
        };
        setSelected(row);
        setState(s => ({
          ...s,
          albums: s.albums.map(a => a.id === row.id ? row : a)
        }));
      }
    } else if (action.kind === 'photos') {
      updatePhotos(photos.rows.filter(p => !action.ids.includes(p.id)));
      setViewer(null);
    } else if (action.kind === 'cover') {
      const row = {
        ...selected,
        cover_image_url: action.photo.image_url,
        localChanged: true
      };
      setSelected(row);
      setState(s => ({
        ...s,
        albums: s.albums.map(a => a.id === row.id ? row : a)
      }));
      setChanged(true);
    } else if (action.kind === 'album') {
      setState(s => ({
        ...s,
        albums: s.albums.filter(a => a.id !== selected.id)
      }));
      setSelected(null);
      setChanged(true);
    }
    setAction(null);
    setNotice('Local preview updated. No files or database records were changed.');
  };
  if (!allowed) return <section className="ap-section"><h1>Gallery</h1><p>Gallery access in All 4M Padel is required.</p></section>;
  if (state.context !== context || state.loading) return <section className="ap-section"><RecordLoading label="Loading gallery albums…" detail="Reading authorised albums and linked records." /></section>;
  if (state.error) return <section className="ap-section" role="alert"><h1>Gallery unavailable</h1><p>{state.error}</p><button className="ap-secondary" onClick={() => setReload(n => n + 1)}>Try again</button></section>;
  const restricted = !!permittedAlbumIds(state.grant);
  const albums = filterGallery(state.albums, filters),
    current = Math.min(page, Math.max(1, Math.ceil(albums.length / 12))),
    photoRows = photos.id === selected?.id ? photos.rows : [],
    photoPages = Math.max(1, Math.ceil(photoRows.length / 24)),
    currentPhoto = Math.min(photoPage, photoPages);
  return <section className="gw-root"><header className="gw-heading"><div><p className="ap-kicker">Publishing / Gallery</p><h1>{selected ? selected.title : 'Gallery albums'}</h1><p>{selected ? `${photoRows.length} photos · ${selected.calendar?.event_name || 'No event linked'}` : 'Albums, event photography and linked collections.'}</p></div><div className="gw-actions">{selected ? <><button className="ap-secondary" onClick={() => setSelected(null)}>Back to albums</button>{!restricted && <button className="ap-secondary" onClick={() => setEditor({
            album: selected
          })}>Edit album</button>}{!restricted && <button className="ap-danger" onClick={() => setAction({
            kind: 'album'
          })}>{persistent ? 'Remove album' : 'Remove album locally'}</button>}</> : <>{!restricted && <button className="ap-primary" onClick={() => setEditor({album:null,operationId:crypto.randomUUID()})}>{persistent ? 'Create album' : 'Create album draft'}</button>}<button className="ap-secondary" onClick={() => changed ? setAction({
            kind: 'refresh'
          }) : setReload(n => n + 1)}>Reload gallery</button></>}</div></header>
    <p className="gw-notice">{persistent ? 'Staging writes enabled. Every save, upload and removal requires confirmation. Original storage files are retained when image records are removed.' : 'Read authorised live records. All create, edit, upload and removal actions below are local drafts only; nothing is published or deleted. Reloading discards drafts.'}</p>{notice && <p role="status">{notice}</p>}{saveError && <p role="alert">{saveError} <button className="ap-secondary" disabled={busy} onClick={()=>setReload(n=>n+1)}>Reload gallery</button></p>}
    {!selected ? <><div className="gw-filters"><label>Search albums<input placeholder="Title, event or photographer…" value={filters.query} onChange={e => {
            setFilters(f => ({
              ...f,
              query: e.target.value
            }));
            setPage(1);
          }} /></label><label>Status<SearchableDropdown value={filters.status} onChange={e => {
            setFilters(f => ({
              ...f,
              status: e.target.value
            }));
            setPage(1);
          }}><option value="">All statuses</option><option value="active">Active</option><option value="hidden">Hidden</option></SearchableDropdown></label><label>Organisation<SearchableDropdown value={filters.organisation} onChange={e => {
            setFilters(f => ({
              ...f,
              organisation: e.target.value
            }));
            setPage(1);
          }}><option value="">All organisations</option>{state.organisations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</SearchableDropdown></label><label>Collection<SearchableDropdown value={filters.parent} onChange={e => {
            setFilters(f => ({
              ...f,
              parent: e.target.value
            }));
            setPage(1);
          }}><option value="">All albums</option><option value="top">Top-level albums</option>{state.albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</SearchableDropdown></label></div><div className="gw-grid">{albums.slice((current - 1) * 12, current * 12).map(album => <button className="gw-album" key={album.id} onClick={() => setSelected(album)}><Thumbnail src={album.cover_image_url} local={!!album.localChanged} /><span className="gw-card-body"><span className="gw-badges">{album.is_featured && <span>Featured</span>}<span>{album.is_active ? 'Active' : 'Hidden'}</span>{album.localChanged && <span>Local draft</span>}</span><strong>{album.title}</strong><span>{album.calendar?.event_name || album.organisations?.name || 'Standalone album'}</span><small>{album.album_date?.slice(0, 10) || 'Date not recorded'}{album.photographer_name && ` · ${album.photographer_name}`}</small></span></button>)}</div>{!albums.length && <p className="ap-section">No albums match these filters.</p>}<div className="gw-pagination"><button className="ap-secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>{albums.length} albums · Page {current} of {Math.max(1, Math.ceil(albums.length / 12))}</span><button className="ap-secondary" disabled={current * 12 >= albums.length} onClick={() => setPage(current + 1)}>Next</button></div></> : <>
    {photos.loading || photos.id !== selected.id ? <RecordLoading label="Loading album photos…" /> : photos.error ? <p role="alert">{photos.error}</p> : <><div className="gw-actions"><input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={stageFiles} /><button className="ap-primary" onClick={() => fileInput.current.click()}>{persistent ? 'Upload photos' : 'Add photo drafts'}</button><button className="ap-secondary" disabled={!photoRows.length} onClick={() => setChecked(checked.length === photoRows.length ? [] : photoRows.map(p => p.id))}>{checked.length === photoRows.length && photoRows.length ? 'Deselect all' : 'Select all photos'}</button><button className="ap-danger" disabled={!checked.length} onClick={() => setAction({
            kind: 'photos',
            ids: checked
          })}>{persistent ? 'Remove selected' : 'Remove selected locally'} ({checked.length})</button></div><div className="gw-grid gw-photos">{photoRows.slice((currentPhoto - 1) * 24, currentPhoto * 24).map((photo, index) => <article key={photo.id} className="gw-photo"><button className="gw-photo-open" aria-label={`Open photo ${(currentPhoto - 1) * 24 + index + 1}`} onClick={() => setViewer(photo)}><Thumbnail src={photo.thumbnail_url || photo.image_url} local={photo.local} /></button><label className="gw-check"><input type="checkbox" checked={checked.includes(photo.id)} onChange={() => setChecked(ids => ids.includes(photo.id) ? ids.filter(id => id !== photo.id) : [...ids, photo.id])} />Photo {(currentPhoto - 1) * 24 + index + 1}{selected.cover_image_url === photo.image_url ? ' · Cover' : ''}{photo.local ? ' · Local' : ''}</label></article>)}</div>{!photoRows.length && <p className="ap-section">This album has no photos yet.</p>}<div className="gw-pagination"><button className="ap-secondary" disabled={currentPhoto === 1} onClick={() => setPhotoPage(currentPhoto - 1)}>Previous photos</button><span>Page {currentPhoto} of {photoPages}</span><button className="ap-secondary" disabled={currentPhoto === photoPages} onClick={() => setPhotoPage(currentPhoto + 1)}>Next photos</button></div></>}
    </>}
    {editor && <AlbumEditor album={editor.album} albums={state.albums} events={state.events} organisations={state.organisations} onClose={() => {if(!busyRef.current)setEditor(null);}} onApply={applyAlbum} persistent={persistent} busy={busy} blocked={blocked} saveError={saveError} />}
    {viewer && !action && <GalleryDialog title="Photo details" onClose={() => setViewer(null)}><section className="gw-body gw-viewer"><Thumbnail src={viewer.image_url} local={viewer.local} /><div className="gw-actions"><button className="ap-primary" onClick={() => setAction({
            kind: 'cover',
            photo: viewer
          })}>{persistent ? 'Use as cover' : 'Use as cover locally'}</button><button className="ap-danger" onClick={() => setAction({
            kind: 'photos',
            ids: [viewer.id]
          })}>{persistent ? 'Remove photo' : 'Remove photo locally'}</button>{galleryImageUrl(viewer.image_url, viewer.local) && <a className="ap-secondary" target="_blank" rel="noopener noreferrer" href={galleryImageUrl(viewer.image_url, viewer.local)}>Open original image</a>}</div></section></GalleryDialog>}
    {action && <GalleryDialog title={persistent ? 'Review staging gallery change' : 'Review local gallery change'} onClose={closeAction}>
      <section className="gw-body">{saveError&&<p role="alert">{saveError}</p>}
        <p>{persistent && action.kind!=='refresh' ? (action.kind==='upload' ? `Upload ${action.rows.length} photos to staging storage and register them?` : action.kind==='cover' ? 'Set this staging album cover?' : action.kind==='album' ? 'Delete this staging album and associated image records? Original storage files will be retained.' : `Remove ${action.ids.length} photo records from staging? Original storage files will be retained.`) : action.kind === 'refresh' ? 'Discard all local drafts and reload authorised records?' : action.kind === 'upload' ? `Add ${action.rows.length} photo previews? Files stay on this device; no storage upload occurs.` : action.kind === 'cover' ? 'Use this photo as the cover in this local preview?' : action.kind === 'album' ? 'Remove this album from the local preview? The live album and all storage files remain unchanged.' : `Remove ${action.ids.length} selected photos from the local preview?`}</p>
        {action.kind === 'upload' && <><div className="gw-grid">{action.rows.map(p => <Thumbnail key={p.id} src={p.image_url} local />)}</div><p>Live source upload uses JPEG full images up to 1920px (.82 quality) and 600px thumbnails (.7 quality). {persistent ? 'Files upload only after confirmation.' : 'Upload integration is not enabled.'}</p></>}
        <div className="gw-actions"><button className="ap-secondary" disabled={busy} onClick={closeAction}>Cancel</button><button className={['album','photos'].includes(action.kind) ? 'ap-danger' : 'ap-primary'} disabled={busy||(blocked&&action.kind!=='refresh')} onClick={() => action.kind === 'refresh' ? (setAction(null), setReload(n => n + 1)) : confirm()}>{busy ? 'Working…' : action.kind === 'refresh' ? 'Discard and reload' : persistent ? 'Confirm staging change' : 'Apply local change'}</button></div>
      </section></GalleryDialog>}
  </section>;
}
