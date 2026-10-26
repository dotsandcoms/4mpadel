import React, {useId, useRef, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight} from 'lucide-react';

const months = Array.from({length:12},(_,i)=>new Intl.DateTimeFormat('en-ZA',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1))));
export default function MonthPicker({value,onChange}) {
  const [open,setOpen] = useState(false);
  const [year,setYear] = useState(Number(value.slice(0,4)) || new Date().getFullYear());
  const id = useId();
  const trigger = useRef(null);
  const close = () => {setOpen(false); trigger.current?.focus();};
  const selectedMonth = Number(value.slice(5,7));
  return <div className="fo-month-picker" onKeyDown={e=>{if(e.key==='Escape' && open){e.preventDefault();close();}}}>
    <span id={`${id}-label`}>Month</span>
    <button ref={trigger} type="button" className="fo-month-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={id} onClick={()=>{setYear(Number(value.slice(0,4)) || new Date().getFullYear());setOpen(!open);}}>
      <span id={`${id}-value`}>{months[selectedMonth-1] || 'Choose month'} {value.slice(0,4)}</span><CalendarDays size={18} aria-hidden="true"/>
    </button>
    {open && <div id={id} className="fo-month-panel" role="group" aria-label="Choose a reporting month">
      <div className="fo-month-year"><button type="button" aria-label="Previous year" disabled={year<=1900} onClick={()=>setYear(year-1)}><ChevronLeft size={18}/></button><strong aria-live="polite">{year}</strong><button type="button" aria-label="Next year" disabled={year>=9998} onClick={()=>setYear(year+1)}><ChevronRight size={18}/></button></div>
      <div className="fo-month-grid">{months.map((month,i)=><button type="button" key={month} aria-label={`${month} ${year}`} aria-pressed={value===`${year}-${String(i+1).padStart(2,'0')}`} onClick={()=>{onChange(`${year}-${String(i+1).padStart(2,'0')}`);close();}}>{month.slice(0,3)}</button>)}</div>
      <button type="button" className="fo-month-close" onClick={close}>Close picker</button>
    </div>}
  </div>;
}
