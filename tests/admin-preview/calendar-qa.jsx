import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import CalendarWorkspace from '../../src/pages/admin-preview/CalendarWorkspace';
import '../../src/pages/AdminPreview.css';
import {mockReadClient} from './playersTestData.mjs';
import {calendarTables} from './calendarTestData.mjs';
const integration = new URLSearchParams(location.search).has('integration');
const source = { ...calendarTables, calendar: calendarTables.calendar.map(event => ({ ...event, is_manual: !event.rankedin_id, is_quick_event: event.id === 9002 })) };
const client = mockReadClient(source);
window.calendarQA = { client };
function MockEditor({ event, onClose }) {
  return <section role="dialog" aria-label="Mock shared event editor"><h2>Shared event editor: {event.event_name}</h2><button onClick={() => onClose({ refresh: false })}>Close without saving</button><button onClick={() => {
    source.calendar = source.calendar.map(row => row.id === event.id ? { ...row, event_name: 'QA updated event' } : row);
    onClose({ refresh: true });
  }}>Simulate saved change</button></section>;
}
function MockCreation({ onClose }) {
  return <section role="dialog" aria-label="Mock creation editor"><button onClick={() => onClose({ refresh: false })}>Cancel creation</button><button onClick={() => {
    source.calendar.push({ id: 9999, is_manual: true, event_name: 'QA newly created event', start_date: '2026-11-01', is_visible: false });
    onClose({ refresh: true, eventId: 9999 });
  }}>Simulate creation</button></section>;
}
function MockQuickEditor(props) {
  return <div data-quick-editor><MockEditor {...props}/></div>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><div className="ap-root" style={{display:'block',padding:'24px',maxWidth:'1440px',margin:'auto'}}><p style={{background:'#fff0d1',padding:'12px'}}>SYNTHETIC CALENDAR TEST — no database connection.</p><CalendarWorkspace session={{user:{id:'qa-only'}}} client={client} canManageEvents={integration} DetailsDialog={MockEditor} CreationDialog={MockCreation} QuickCreationDialog={MockCreation} QuickDetailsDialog={MockQuickEditor}/></div></BrowserRouter>);
