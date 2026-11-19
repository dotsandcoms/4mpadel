import React, {useId, useRef, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight} from 'lucide-react';
import {financeDate} from './financeOverviewData.js';

const labelDate = value => new Intl.DateTimeFormat('en-ZA',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
export default function DatePicker({label,value,onChange,min=''}) {
  const today = financeDate(new Date().toISOString());
  const [open,setOpen] = useState(false);
  const [month,setMonth] = useState((value || min || today).slice(0,7));
  const id = useId();
  const trigger = useRef(null);
  const [year,monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year,monthNumber-1,1));
  const count = new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  const offset = (first.getUTCDay()+6)%7;
  const close = () => {setOpen(false);trigger.current?.focus();};
  const step = amount => setMonth(new Date(Date.UTC(year,monthNumber-1+amount,1)).toISOString().slice(0,7));
  return <div className="fo-month-picker fo-date-picker" onKeyDown={e=>{if(e.key==='Escape' && open){e.preventDefault();close();}}}>
    <span id={`${id}-label`}>{label}</span>
    <button type="button" ref={trigger} className="fo-month-trigger" aria-expanded={open} aria-controls={id} aria-labelledby={`${id}-label ${id}-value`} onClick={()=>{setMonth((value && (!min || value>=min) ? value : min || today).slice(0,7));setOpen(!open);}}><span id={`${id}-value`}>{value ? labelDate(value) : 'Choose date'}</span><CalendarDays size={18} aria-hidden="true"/></button>
    {open && <div id={id} className="fo-month-panel fo-date-panel" role="group" aria-label={`Choose ${label.toLowerCase()}`}>
      <div className="fo-month-year"><button type="button" aria-label="Previous month" disabled={month<='1900-01' || Boolean(min && month<=min.slice(0,7))} onClick={()=>step(-1)}><ChevronLeft size={18}/></button><strong aria-live="polite">{new Intl.DateTimeFormat('en-ZA',{month:'long',year:'numeric',timeZone:'UTC'}).format(first)}</strong><button type="button" aria-label="Next month" disabled={month>='9998-12'} onClick={()=>step(1)}><ChevronRight size={18}/></button></div>
      <div className="fo-date-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><span key={day} className="fo-weekday">{day}</span>)}{Array.from({length:offset},(_,i)=><span key={`space-${i}`} aria-hidden="true"/>)}{Array.from({length:count},(_,i)=>{
        const day = `${month}-${String(i+1).padStart(2,'0')}`;
        return <button type="button" key={day} aria-label={labelDate(day)} aria-pressed={value===day} aria-current={today===day?'date':undefined} disabled={Boolean(min && day<min)} onClick={()=>{onChange(day);close();}}>{i+1}</button>;
      })}</div>
      <button type="button" className="fo-month-close" onClick={close}>Close picker</button>
    </div>}
  </div>;
}
