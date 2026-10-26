import React from 'react';
import {createRoot} from 'react-dom/client';
import ClubManagement from '../../src/pages/admin-preview/ClubManagement.jsx';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/FinanceOverview.css';
import '../../src/pages/admin-preview/ClubsWorkspace.css';
const client={from(table){let start=0; const rows=Array.from({length:8},(_,id)=>({id:String(id),players:{name:`Synthetic member ${id}`},full_name:`Synthetic claimant ${id}`,user_email:`member${id}@example.invalid`,requester_email:`claim${id}@example.invalid`,role:'staff',status:'pending'})); return {select(){return this;},eq(){return this;},order(){return this;},range(value){start=value;return this;},abortSignal(){return this;},then(resolve){return Promise.resolve({data:rows.slice(start,start+3)}).then(resolve);}};}};
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{display:'block',padding:24}}><div className="fo-root clubs-root"><ClubManagement client={client} session={{user:{id:'qa'}}} permissions={{role:'super_admin'}} scopeId="all" clubId="qa-club"/></div></div>);
