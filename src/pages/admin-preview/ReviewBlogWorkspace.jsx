import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit2, ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { ReviewDialog } from './ReviewNavigationDialogs';
import RecordLoading from './RecordLoading';
import { verifyHostedReviewAccess } from './hostedReviewAccess';
import { canOpenReviewPage } from './access';
import { readAll } from './playersData';
import './ReviewSettingsWorkspace.css';

const blankPost = () => ({
  title: '', slug: '', author: '', category: '', content: '', status: 'Draft', image_url: '',
  date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date()),
});
const editFields = { title: 'Post title', slug: 'URL slug', author: 'Author', category: 'Category' };
const supportedImage = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const rowsPerPage = 50;

async function checkBlogAccess(client, user, signal) {
  const { permissions } = await verifyHostedReviewAccess(client, user, signal);
  if (!canOpenReviewPage(permissions, 'blog')) throw new Error('Current Blog access is required.');
}

function preparePost(draft) {
  const title = draft.title.trim();
  const slug = (draft.slug.trim() || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!title || !slug || !draft.content.trim()) throw new Error('Enter a title, slug and post content.');
  return { ...draft, title, slug, author: draft.author.trim(), category: draft.category.trim() };
}

function editPost(post) {
  const dates = blankPost();
  const fields = Object.fromEntries(Object.keys(dates).map(key => [key, post[key] ?? dates[key]]));
  fields.date = String(fields.date).slice(0, 10);
  return fields;
}

export default function ReviewBlogWorkspace({ client, session, refreshRevision }) {
  const [posts, setPosts] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [remove, setRemove] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const current = useRef(null);
  const locked = useRef(false);
  const { id: userId, email } = session.user;

  useEffect(() => {
    const controller = new AbortController();
    current.current = controller;
    setError('');
    setPosts(null);
    setBusy(false);
    const load = async () => {
      await checkBlogAccess(client, { id: userId, email }, controller.signal);
      const rows = await readAll(() => client.from('blogs').select('*').order('created_at', { ascending: false }).order('id'), controller.signal);
      if (!controller.signal.aborted) setPosts(rows);
    };
    load().catch(() => {
      if (!controller.signal.aborted) setError('Blog posts could not be loaded. Reload to retry.');
    });
    return () => controller.abort();
  }, [client, userId, email, refreshRevision, revision]);

  const run = async operation => {
    if (locked.current || !current.current || current.current.signal.aborted) return;
    const { signal } = current.current;
    locked.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await checkBlogAccess(client, { id: userId, email }, signal);
      const message = await operation(signal);
      if (!signal.aborted) setNotice(message);
    } catch (issue) {
      if (!signal.aborted) setError(issue?.message || 'The blog change could not be saved.');
    } finally {
      locked.current = false;
      if (!signal.aborted) setBusy(false);
    }
  };

  const openEditor = post => {
    setError('');
    setEditor({ record: post, draft: post ? editPost(post) : blankPost(), file: null });
  };
  const closeEditor = () => {
    if (locked.current) return;
    setEditor(null);
    setError('');
  };
  const setField = (key, value) => setEditor(valueBefore => ({ ...valueBefore, draft: { ...valueBefore.draft, [key]: value } }));
  const setCover = file => {
    if (!file || locked.current) return;
    if (!supportedImage[file.type] || file.size > 10 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, WebP or GIF of 10 MB or less.');
      return;
    }
    setError('');
    setEditor(value => ({ ...value, file }));
  };

  const save = event => {
    event.preventDefault();
    void run(async signal => {
      const draft = preparePost(editor.draft);
      const bucket = client.storage.from('blog-images');
      let uploadedPath;
      let writeAttempted = false;
      try {
        if (editor.file) {
          uploadedPath = `${crypto.randomUUID()}.${supportedImage[editor.file.type]}`;
          const uploaded = await bucket.upload(uploadedPath, editor.file);
          if (uploaded.error) throw uploaded.error;
          draft.image_url = bucket.getPublicUrl(uploadedPath).data.publicUrl;
        }
        if (signal.aborted) throw new DOMException('The editor was closed.', 'AbortError');
        const table = client.from('blogs');
        const query = editor.record ? table.update(draft).eq('id', editor.record.id) : table.insert(draft);
        writeAttempted = true;
        const { data, error: writeError } = await query.select('id').maybeSingle();
        if (writeError || !data) throw writeError || new Error('Blog changes could not be confirmed.');
      } catch (issue) {
        if (uploadedPath && (!writeAttempted || /^(22|23|42)\d{3}$/.test(issue?.code || ''))) {
          await bucket.remove([uploadedPath]).catch(() => {});
        }
        throw issue;
      }
      if (!signal.aborted) {
        setEditor(null);
        setRevision(value => value + 1);
      }
      return 'Blog post saved.';
    });
  };

  const removePost = () => void run(async signal => {
    const { data, error: deleteError } = await client.from('blogs').delete().eq('id', remove.id).select('id').maybeSingle();
    if (deleteError || !data) throw deleteError || new Error('Blog deletion could not be confirmed.');
    if (!signal.aborted) {
      setRemove(null);
      setPosts(rows => rows.filter(row => row.id !== remove.id));
    }
    return 'Blog post deleted.';
  });

  const categories = [...new Set((posts || []).map(post => post.category).filter(Boolean))].sort();
  const search = query.toLowerCase().trim();
  const filtered = (posts || []).filter(post => (!category || post.category === category)
    && [post.title, post.author, post.content].some(value => String(value || '').toLowerCase().includes(search)));
  const pages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const selectedPage = Math.min(page, pages);
  const visible = filtered.slice((selectedPage - 1) * rowsPerPage, selectedPage * rowsPerPage);

  return <>
    <header className="ap-page-heading">
      <div><p className="ap-kicker">Publish</p><h1>Blog</h1><p className="ap-lede">Write posts, manage drafts and publish updates.</p></div>
      <div className="ap-heading-actions">
        <button className="ap-secondary" disabled={busy || (!posts && !error)} onClick={() => setRevision(value => value + 1)}>Reload posts</button>
        <button className="ap-primary" disabled={busy || !posts} onClick={() => openEditor(null)}><Plus size={17} /> New post</button>
      </div>
    </header>
    {error && !editor && !remove && <p className="ap-data-notice" role="alert">{error}</p>}
    {notice && <p className="ap-data-notice" role="status">{notice}</p>}
    {!posts && !error && <RecordLoading label="Loading posts…" />}
    {posts && <>
      <div className="ap-filter-bar">
        <label className="ap-filter-search"><Search size={17}/><span className="ap-visually-hidden">Search posts</span>
          <input type="search" placeholder="Search posts" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
        </label>
        <label><span className="ap-visually-hidden">Category</span><SearchableDropdown value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}>
          <option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}
        </SearchableDropdown></label>
      </div>
      <section className="ap-section pp-table-wrap">
        <table className="pp-table">
          <thead><tr><th>Post</th><th>Category</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{visible.map(post => <tr key={post.id}>
            <td><strong>{post.title}</strong><small>{post.author || 'Author unassigned'}</small></td>
            <td>{post.category || 'Uncategorised'}</td><td>{String(post.date || '').slice(0, 10)}</td><td>{post.status}</td>
            <td><div className="ap-heading-actions">
              {post.status === 'Published' && <a className="ap-secondary" href={`/blog/${encodeURIComponent(post.slug || post.id)}`} target="_blank" rel="noreferrer" aria-label={`View ${post.title}`}><ExternalLink size={16}/></a>}
              <button className="ap-secondary" aria-label={`Edit ${post.title}`} onClick={() => openEditor(post)}><Edit2 size={16}/></button>
              <button className="ap-secondary" aria-label={`Delete ${post.title}`} onClick={() => { setError(''); setRemove(post); }}><Trash2 size={16}/></button>
            </div></td>
          </tr>)}</tbody>
        </table>
        {filtered.length === 0 && <p className="ap-settings-content">No matching posts.</p>}
      </section>
      {pages > 1 && <div className="ap-section-heading">
        <button className="ap-secondary" disabled={selectedPage === 1} onClick={() => setPage(selectedPage - 1)}><ChevronLeft size={16}/> Previous</button>
        <span>Page {selectedPage} of {pages}</span>
        <button className="ap-secondary" disabled={selectedPage === pages} onClick={() => setPage(selectedPage + 1)}>Next <ChevronRight size={16}/></button>
      </div>}
    </>}
    {editor && <ReviewDialog title={editor.record ? 'Edit post' : 'New post'} onClose={closeEditor}>
      <form className="ap-settings-content" onSubmit={save}>
        {error && <p className="ap-data-notice" role="alert">{error}</p>}
        <fieldset disabled={busy} className="ap-settings-fields ap-settings-social">
          {Object.entries(editFields).map(([key, label]) => <label key={key}>{label}
            <input required={key === 'title'} value={editor.draft[key]} onChange={event => setField(key, event.target.value)} />
          </label>)}
          <label>Publish date<input required type="date" value={editor.draft.date} onChange={event => setField('date', event.target.value)}/></label>
          <label>Status<select value={editor.draft.status} onChange={event => setField('status', event.target.value)}><option>Draft</option><option>Published</option></select></label>
          <label>Cover image<input type="file" accept={Object.keys(supportedImage).join(',')} onChange={event => setCover(event.target.files[0])}
            onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); setCover(event.dataTransfer.files[0]); }}/></label>
          {(editor.file || editor.draft.image_url) && <div>
            <p>{editor.file ? editor.file.name : 'A cover image is set.'}</p>
            <button className="ap-secondary" type="button" onClick={() => setEditor(value => ({ ...value, file: null, draft: { ...value.draft, image_url: '' } }))}>Remove cover</button>
          </div>}
          <label style={{ gridColumn: '1 / -1' }}>Blog content<textarea required rows={9} value={editor.draft.content} onChange={event => setField('content', event.target.value)}/></label>
        </fieldset>
        <footer><button className="ap-secondary" type="button" disabled={busy} onClick={closeEditor}>Cancel</button>
          <button className="ap-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save post'}</button></footer>
      </form>
    </ReviewDialog>}
    {remove && <ReviewDialog title="Delete post" onClose={() => { if (!locked.current) { setError(''); setRemove(null); } }}>
      <div className="ap-settings-content"><p>Delete <strong>{remove.title}</strong>? This action cannot be undone.</p>
        {error && <p className="ap-data-notice" role="alert">{error}</p>}
        <footer><button type="button" className="ap-secondary" disabled={busy} onClick={() => { setError(''); setRemove(null); }}>Cancel</button>
          <button type="button" className="ap-danger-button" disabled={busy} onClick={removePost}>Delete post</button></footer>
      </div>
    </ReviewDialog>}
  </>;
}
