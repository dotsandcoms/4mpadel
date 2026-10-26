export async function invokeEventRefund(client, body) {
  const { data, error } = await client.functions.invoke('paystack-refund', { body });
  if (error) {
    let payload;
    try { payload = await error.context?.json(); } catch { /* Preserve transport error. */ }
    throw new Error(payload?.error || payload?.message || error.message || 'Request failed');
  }
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

export async function removeEventEntries({ event, entries, mode, invoke, logEventActivity }) {
  if (!['refund', 'cash_refund', 'no_refund'].includes(mode) || !entries.length || entries.length > 2 || new Set(entries.map(row => row.id)).size !== entries.length) throw new Error('Choose entries and a valid removal option.');
  const flags = mode === 'cash_refund' ? { skip_paystack: true } : mode === 'no_refund' ? { no_refund: true } : {};
  let totalRefunded = 0;
  const warnings = [];
  for (const entry of entries) {
    const result = await invoke({ action: 'admin_remove', registration_id: entry.id, ...flags });
    totalRefunded += Number(result?.total_refunded_rands || 0);
    for (const refund of result?.refunds || []) {
      if (refund.status === 'needs_attention' || String(refund.status).startsWith('skipped:')) {
        warnings.push(`${entry.full_name || entry.email}: refund needs review (${refund.status}). Check the refund ledger before retrying.`);
      }
    }
  }
  await logEventActivity({ eventId: event.id, action: 'admin.removed', category: 'ADMIN',
    summary: `Removed ${entries.map(row => row.full_name).join(' & ')}${totalRefunded > 0 ? ` · refunded R ${totalRefunded}` : mode === 'no_refund' ? ' · no refund' : ''}`,
    details: { players: entries.map(row => row.full_name), registration_ids: entries.map(row => row.id), mode, refunded: totalRefunded, division: entries[0].division },
  });
  return { totalRefunded, warnings };
}
