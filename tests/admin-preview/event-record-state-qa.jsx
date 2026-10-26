import React from 'react';
import {createRoot} from 'react-dom/client';
import EventRecordState from '../../src/pages/admin-preview/EventRecordState.jsx';
import '../../src/pages/AdminPreview.css';
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{display:'block',padding:24}}><EventRecordState loading/><div style={{marginTop:24}}><EventRecordState loading={false}/></div></div>);
