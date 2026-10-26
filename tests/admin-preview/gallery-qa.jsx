import React from 'react';
import { createRoot } from 'react-dom/client';
import GalleryWorkspace from '../../src/pages/admin-preview/GalleryWorkspace';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
const image = 'http://127.0.0.1:5175/qa-gallery-image.svg';
const grant = {
  email: 'gallery@example.invalid',
  role: 'super_admin',
  allowed_tabs: [],
  module_permissions: {}
};
const params = new URLSearchParams(location.search);
if (params.has('restricted')) {
  grant.role = 'editor';
  grant.module_permissions = { gallery: { allowedAlbums: ['album-a'] } };
}
const rows = {
  admin_sidebar_permissions: [grant],
  albums: [{
    id: 'album-a',
    title: 'Cape Open',
    is_active: true,
    is_featured: true,
    cover_image_url: image,
    created_at: '2026-01-01',
    photographer_name: 'Photo Studio',
    calendar: {
      event_name: 'Cape Open 2026'
    }
  }, {
    id: 'album-b',
    title: 'Junior collection',
    is_active: false,
    cover_image_url: image,
    created_at: '2025-01-01'
  }],
  calendar: [{
    id: 1,
    event_name: 'Cape Open 2026'
  }],
  organisations: [{
    id: 'org',
    name: 'SA Grand Tour'
  }],
  gallery_images: [{
    id: 'photo-a',
    album_id: 'album-a',
    image_url: image,
    thumbnail_url: image,
    sort_order: 1
  }, {
    id: 'photo-b',
    album_id: 'album-a',
    image_url: image,
    sort_order: 2
  }]
};
const state = window.galleryQA = {
  reads: [],
  writes: [],
  simulated: []
};
const mutationApi = {
  enabled: () => params.has('persistent'),
  saveAlbum: async ({ original, draft, operationId }) => {
    state.simulated.push({ kind: 'saveAlbum', operationId });
    return { ...original, ...draft, id: original?.id || 'created-qa' };
  },
  setCover: async ({ album, photo }) => {
    state.simulated.push({ kind: 'setCover' });
    if(params.has('failure'))throw Error('Synthetic uncertain outcome');
    return { ...album, cover_image_url: photo.image_url };
  },
  removePhotos: async ({ photos }) => {
    state.simulated.push({ kind: 'removePhotos' });
    return { removed_ids: photos.map(p => p.id), retained_storage: true };
  },
  removeAlbum: async ({ album }) => {
    state.simulated.push({ kind: 'removeAlbum' });
    return { album_id: album.id, retained_storage: true };
  },
  uploadPhotos: async ({ album, files }) => {
    state.simulated.push({ kind: 'uploadPhotos' });
    return { album, photos: files.map((_,i)=>({id:`uploaded-${i}`,album_id:album.id,image_url:image})), failures: [] };
  }
};
const client = {
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: 'qa',
          email: 'gallery@example.invalid'
        }
      }
    })
  },
  from(table) {
    let offset = 0;
    const query = new Proxy({}, {
      get(_, key) {
        if (key === 'then') return resolve => {
          state.reads.push(table);
          resolve({
            data: offset ? [] : rows[table] || []
          });
        };
        return (...args) => {
          if (['insert', 'update', 'delete', 'upload', 'rpc'].includes(key)) {
            state.writes.push(key);
            throw Error('Writes forbidden');
          }
          if (key === 'range') offset = args[0];
          return query;
        };
      }
    });
    return query;
  }
};
function App() {
  const [revision, setRevision] = React.useState(0);
  return <div className="ap-root" style={{
    display: 'block',
    padding: 24
  }}><button onClick={() => setRevision(n => n + 1)}>Shell refresh</button><GalleryWorkspace client={client} session={{
      user: {
        id: 'qa',
        email: 'gallery@example.invalid'
      }
    }} permissions={grant} scopeId="all" refreshRevision={revision} mutationApi={mutationApi} /></div>;
}
createRoot(document.getElementById('root')).render(<App />);
