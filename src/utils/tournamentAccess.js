// Tournament assignments are authoritative RPC capabilities, not sidebar grants.
export async function readTournamentAssignments(client, expectedEmail) {
  const email = String(expectedEmail || '').trim().toLowerCase();
  if (!email) return [];
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.id || String(auth.user.email || '').trim().toLowerCase() !== email) {
    throw new Error('The signed-in account changed while resolving Tournament Manager access.');
  }
  const { data, error } = await client.rpc('tm_list_events');
  if (error) throw error;
  if (!Array.isArray(data) || data.some(row => !row || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0)) throw new Error('Tournament Manager access returned an unexpected response.');
  return data;
}
