// Supabase caps un-ranged selects at 1000 rows, silently truncating results.
// This pages through everything. `buildQuery` must return a FRESH query builder
// on every call (builders are single-use), ideally with a stable .order() so
// pages don't skip or duplicate rows.
//
//   const players = await fetchAllRows(() =>
//       supabase.from('players').select('id, name').order('id', { ascending: true })
//   );
export async function fetchAllRows(buildQuery, pageSize = 1000) {
    const all = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return all;
}
