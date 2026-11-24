import * as Sentry from 'npm:@sentry/deno@8.55.2';

const dsn = Deno.env.get('SENTRY_EDGE_DSN')?.trim();
let enabled = false;
if (dsn) {
  try {
    Sentry.init({
      dsn,
      environment: Deno.env.get('SENTRY_EDGE_ENVIRONMENT') || 'production',
      defaultIntegrations: false,
      sendDefaultPii: false,
      tracesSampler: ({ name }) => name === 'POST /extract-playtomic-level' ? 1 : 0.1,
      beforeSend: () => null,
    });
    enabled = Sentry.isInitialized();
  } catch { /* An invalid monitoring configuration must not take the endpoint offline. */ }
}

type Span = ReturnType<typeof Sentry.startInactiveSpan>;
type EdgeHandler = (request: Request, span?: Span) => Response | Promise<Response>;

export function traceEdgeRequest(route: string, handler: EdgeHandler) {
  return async (request: Request) => {
    if (!enabled || request.method !== 'POST') return handler(request);
    // Create the scope synchronously and pass the parent explicitly to downstream spans.
    const span = Sentry.startNewTrace(() => Sentry.startInactiveSpan({
      name: `POST /${route}`, op: 'http.server', forceTransaction: true, attributes: {
        'sentry.source': 'route', 'http.request.method': 'POST', 'http.route': `/${route}`,
      },
    }));
    try {
      const response = await handler(request, span);
      Sentry.setHttpStatus(span, response.status);
      return response;
    } catch (error) {
      Sentry.setHttpStatus(span, 500);
      throw error;
    } finally {
      const sampled = span.isRecording();
      span.end();
      if (sampled) {
        const flush = Sentry.flush(1000).catch(() => false);
        const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
        if (!runtime) await flush;
        else try { runtime.waitUntil(flush); } catch { /* Delivery must not affect the response. */ }
      }
    }
  };
}

function providerModel(value: unknown) {
  return typeof value === 'string' && /^(?:gpt-|o[1-9](?:-|$))[a-z0-9.-]{0,52}$/i.test(value) ? value : 'openai';
}

export async function tracePlaytomicModel<T>(
  requestedModel: string,
  read: () => Promise<{ response: Response; result: T | null }>,
  parent?: Span,
) {
  if (!parent) return read();
  const model = providerModel(requestedModel);
  // Capture only model metadata and token counts. The request contains a player's screenshot.
  const span = Sentry.startInactiveSpan({ name: `chat ${model}`, op: 'gen_ai.chat', parentSpan: parent, attributes: {
    'gen_ai.operation.name': 'chat',
    'gen_ai.provider.name': 'openai',
    'gen_ai.request.model': model,
    'gen_ai.pipeline.name': 'playtomic_rating_import',
  } });
  try {
    const output = await read();
    Sentry.setHttpStatus(span, output.response.status);
    const result = output.result as { model?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null;
    if (result?.model) span.setAttribute('gen_ai.response.model', providerModel(result.model));
    for (const key of ['input_tokens', 'output_tokens'] as const) {
      const value = result?.usage?.[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) span.setAttribute(`gen_ai.usage.${key}`, value);
    }
    return output;
  } catch (error) {
    span.setStatus({ code: 2, message: 'internal_error' });
    span.setAttribute('error.type', 'provider_request_failed');
    throw error;
  } finally {
    span.end();
  }
}
