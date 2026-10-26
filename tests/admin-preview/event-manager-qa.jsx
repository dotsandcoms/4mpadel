import React from 'react';
import {createRoot} from 'react-dom/client';
import EventManagerDashboard from '../../src/pages/admin-preview/EventManagerDashboard';
import '../../src/pages/AdminPreview.css';
import {calendarEvents} from './calendarTestData.mjs';
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{display:'block',padding:24}}><p>Synthetic Event Manager QA — no database connection</p><EventManagerDashboard events={calendarEvents} registrations={[]} go={(page,payload)=>{document.title=`Opened ${payload?.event?.id || page}`;}} /></div>);
