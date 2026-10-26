export function financeStatusTone(status) {
  switch(String(status || '').trim().toLowerCase()) {
    case 'success': case 'successful': return 'positive';
    case 'processed': return 'info';
    case 'pending': case 'processing': case 'queued': return 'warning';
    case 'failed': case 'cancelled': case 'canceled': return 'danger';
    default: return 'neutral';
  }
}
export const financeAmountTone=amount=>amount<0 ? 'negative' : amount>0 ? 'positive' : 'neutral';
export const financeStatusKey=status=>String(status || '').trim().toLowerCase() || 'not recorded';
export const matchesFinanceStatus=(entry,status)=>!status || financeStatusKey(entry.status)===status;

export function sortFinanceRows(rows,{key,direction}) {
  const sign=direction==='asc' ? 1 : -1;
  return [...rows].sort((a,b)=>{
    let left=a[key],right=b[key];
    if(key==='date') {
      left=Date.parse(left);right=Date.parse(right);
      // Unknown dates always follow dated entries, regardless of direction.
      if(!Number.isFinite(left) || !Number.isFinite(right)) {
        if(Number.isFinite(left))return -1;
        if(Number.isFinite(right))return 1;
        left=right=0;
      }
    }
    const comparison=typeof left==='number' && typeof right==='number' ? left-right : String(left || '').localeCompare(String(right || ''));
    return sign*comparison || String(a.key ?? a.id).localeCompare(String(b.key ?? b.id));
  });
}
