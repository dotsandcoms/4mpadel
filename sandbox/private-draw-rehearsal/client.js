import { createRehearsalClient } from './store.js';
let client;
export function initialiseRehearsal(snapshot, onSave) {
    client = createRehearsalClient(snapshot, onSave);
    return client;
}
export const supabase = {
    from: table => client.from(table),
    rpc: (name, args) => client.rpc(name, args),
    auth: { getUser: () => client.auth.getUser() },
};
export const isSupabaseConfigured = () => false;
