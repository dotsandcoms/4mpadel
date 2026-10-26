import React from 'react';
import { createRoot } from 'react-dom/client';
import EventEntryForm from '../../src/pages/admin-preview/EventEntryForm.jsx';
import '../../src/pages/AdminPreview.css';
const search = async q => [{id:q, name:q, email:`${q}@example.test`}];
const save = new URLSearchParams(location.search).has('save') ? async draft => { window.saveCalls = (window.saveCalls || 0) + 1; window.savedDraft = draft; return {warnings:[]}; } : undefined;
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{display:'block',padding:24}}><EventEntryForm divisions={[{id:1,name:'Open',entry_fee:500}]} search={search} save={save} onReview={draft=>{window.review=draft;}}/></div>);
