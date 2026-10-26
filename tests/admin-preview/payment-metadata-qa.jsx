import React from 'react';
import {createRoot} from 'react-dom/client';
import PaymentMetadataReview from '../../src/pages/admin-preview/PaymentMetadataReview.jsx';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/FinanceOverview.css';
const client={from:()=>{const query={select:()=>query,eq:()=>query,abortSignal:()=>query,single:async()=>({data:{id:1,metadata:{source:'manual_event',registrant_email:'payer@example.invalid',inherited_covers_from_sibling:true,covers:[{email:'partner@example.invalid',type:'entry',division:'Open'},{email:'partner@example.invalid',type:'license',license:'full',license_year:2026}],line_items:[{type:'entry_fee',player:'Synthetic Partner',paid_by:'Synthetic Payer',amount:500}]}}})};return query;}};
createRoot(document.getElementById('root')).render(<div className="ap-root"><main className="fo-root"><h1>Synthetic payment evidence review</h1><p>No network requests or financial actions.</p><PaymentMetadataReview paymentId={1} client={client} session={{user:{id:'synthetic'}}} permissions={{role:'super_admin'}} scopeId="all"/></main></div>);
