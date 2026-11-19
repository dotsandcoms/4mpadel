import React from 'react';
import './RecordLoading.css';

export default function RecordLoading({label='Loading records…',count,detail='Reading accessible records. Larger histories may take longer.'}) {
  const hasCount=Number.isFinite(count) && count>=0;
  const progress=hasCount ? count>0 ? `${count.toLocaleString()} records loaded`:'Waiting for the first batch':null;
  return <div className="ap-record-loading" role="status" aria-live="polite">
    <p>{label}{progress && ` ${progress}`}</p>
    <div className="ap-loading-track" role="progressbar" aria-label={label} aria-valuetext={progress ? `${progress}; total not yet known`:'Loading; total not yet known'}><span/></div>
    <p className="ap-record-loading-note">{detail}</p>
  </div>;
}
