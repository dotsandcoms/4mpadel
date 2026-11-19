import React from 'react';
export default function FinanceSortHeader({label,field,sort,onSort}) {
  const active=sort.key===field;
  const direction=active && sort.direction==='asc' ? 'desc':'asc';
  return <th scope="col" aria-sort={active ? sort.direction==='asc' ? 'ascending':'descending' : 'none'}>
    <button type="button" className="fo-sort-button" aria-label={`${label}: sort ${direction==='asc' ? 'ascending':'descending'}`} onClick={()=>onSort({key:field,direction})}>
      {label}<span aria-hidden="true">{active ? sort.direction==='asc' ? '↑':'↓' : '↕'}</span>
    </button>
  </th>;
}
