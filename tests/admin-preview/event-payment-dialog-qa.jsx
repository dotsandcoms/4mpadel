import React from 'react';
import { createRoot } from 'react-dom/client';
import EventPaymentDialog from '../../src/pages/admin-preview/EventPaymentDialog.jsx';
import '../../src/pages/AdminPreview.css';
createRoot(document.getElementById('root')).render(<div className="ap-root"><EventPaymentDialog action={{type:'comp',registration:{id:1,full_name:'Example Player',division:'Open'}}} event={{id:1,event_name:'Example Event'}} divisions={[{name:'Open',entry_fee:500}]} onClose={()=>{}} save={async data=>{window.saved=data;}}/></div>);
