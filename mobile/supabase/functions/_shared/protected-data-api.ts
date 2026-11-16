/**
 * Preserve the existing query interface while private records cross checked
 * RPCs. This adapter is compatibility code; the database authorises every call.
 * Imported by both the website and native client, never by service workers.
 */
const reads: Record<string, string> = {
  event_registrations: 'read_my_registration_rows',
  payments: 'read_my_payment_rows',
  calendar: 'read_calendar_rows',
};
const filters = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'like', 'ilike', 'in', 'is', 'not', 'or', 'contains', 'containedBy', 'filter', 'match']);

export function protectDataApi<T extends { from: (...args: any[]) => any; rpc: (...args: any[]) => any }>(client: T, options: { enabled?: boolean } = {}): T {
  if (options.enabled === false) return client;
  const originalFrom = client.from.bind(client);
  client.from = ((entity: string, ...args: any[]) => {
    if (!reads[entity]) return originalFrom(entity, ...args);
    let action = 'read';
    let values: unknown = null;
    let mutationOptions: unknown = {};
    let columns = '*';
    let selectOptions: Record<string, unknown> = {};
    let returning = false;
    let shape = 'many';
    let throwing = false;
    let signal: AbortSignal | undefined;
    const steps: { method: string; args: unknown[] }[] = [];
    const errorResult = (message: string, code = '22023') => ({ data: null, error: { message, code }, count: null, status: 400, statusText: 'Bad Request' });
    async function execute() {
      if (action === 'read') {
        let query = client.rpc(reads[entity], {}, selectOptions).select(columns);
        for (const step of steps) query = query[step.method](...step.args);
        if (signal) query = query.abortSignal(signal);
        if (throwing) query = query.throwOnError();
        if (shape !== 'many') query = query[shape]();
        return query;
      }
      const unsafe = steps.find(step => !filters.has(step.method));
      if (unsafe) return errorResult('Unsupported mutation filter: ' + unsafe.method);
      let query = client.rpc('mutate_player_records', {
        p_entity: entity, p_action: action, p_values: values,
        p_filters: steps, p_options: mutationOptions || {},
      });
      if (signal) query = query.abortSignal(signal);
      const response = await query;
      if (response.error) { if (throwing) throw response.error; return response; }
      const rows = Array.isArray(response.data) ? response.data : [];
      const projected = columns === '*' ? rows : rows.map((row: Record<string, unknown>) =>
        Object.fromEntries(columns.split(',').map(key => key.trim()).filter(Boolean).map(key => [key, row[key]])));
      if (shape === 'single' && projected.length !== 1) return errorResult('Expected one record.', 'PGRST116');
      if (shape === 'maybeSingle' && projected.length > 1) return errorResult('Expected at most one record.', 'PGRST116');
      return { ...response, data: returning ? shape === 'many' ? projected : projected[0] || null : null,
        count: selectOptions.count ? rows.length : null };
    }
    const builder: any = new Proxy({}, {
      get(_target, method: string) {
        if (method === 'then') return (resolve: any, reject: any) => execute().then(resolve, reject);
        if (method === 'catch') return (reject: any) => execute().catch(reject);
        if (method === 'finally') return (finish: any) => execute().finally(finish);
        return (...parameters: any[]) => {
          if (['insert', 'upsert', 'update', 'delete'].includes(method)) {
            action = method; values = method === 'delete' ? null : parameters[0];
            mutationOptions = parameters[1] || {};
          } else if (method === 'select') {
            columns = parameters[0] || '*'; selectOptions = parameters[1] || {}; returning = true;
          } else if (method === 'single' || method === 'maybeSingle') shape = method;
          else if (method === 'abortSignal') signal = parameters[0];
          else if (method === 'throwOnError') throwing = true;
          else steps.push({ method, args: parameters });
          return builder;
        };
      },
    });
    return builder;
  }) as T['from'];
  return client;
}
