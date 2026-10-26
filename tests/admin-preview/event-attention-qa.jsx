import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import EventAttentionList from '../../src/pages/admin-preview/EventAttentionList.jsx';
import '../../src/pages/AdminPreview.css';
function Fixture(){const [selected,setSelected]=useState(null);return <div className="ap-root" style={{display:'block',padding:24}}><EventAttentionList rows={Array.from({length:12},(_,id)=>({id,name:`Player ${id}`,partner:`Partner ${id}`,division:'Open doubles',issue:'Payment outstanding',eligibility:'Not available'}))} onOpen={setSelected} onBack={()=>{}}/><p role="status">Selected record: {selected ?? 'none'}</p></div>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
