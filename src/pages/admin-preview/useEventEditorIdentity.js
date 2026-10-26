import { useLayoutEffect, useRef } from 'react';
import { eventContinuation } from './eventContinuation';

// Bind a creation session before its first upload/save, not to whichever
// account happens to be signed in when the user finally presses Save.
export default function useEventEditorIdentity(client, session, scopeId) {
  const state = useRef(null);
  const current = useRef(null);
  useLayoutEffect(() => {
    const token = { client, userId: session?.user?.id, scopeId };
    current.current = token;
    state.current = client.auth.getUser().then(({ data, error }) => {
      if (error || !data?.user?.id || (token.userId && token.userId !== data.user.id)) return { error: 'Sign in again before creating an event.' };
      return { actorId: data.user.id };
    }).catch(() => ({ error: 'Your account could not be verified.' }));
    return () => { current.current = null; };
  }, [client, session?.user?.id, scopeId]);
  return async () => {
    const token = current.current;
    if (!token || token.client !== client || token.userId !== session?.user?.id || token.scopeId !== scopeId || scopeId !== 'all') throw new Error('The event editor context changed. Close and reopen it in all workspaces.');
    const result = await state.current;
    if (!result || result.error) throw new Error(result?.error || 'Wait for account verification.');
    if (current.current !== token) throw new Error('The event editor context changed. Close and reopen it.');
    return { expectedUserId: result.actorId, scopeId,
      verifyContinuing: eventContinuation({ client, actorId: result.actorId, token, getCurrent: () => current.current }),
      assertCurrent: () => {
        if (current.current !== token) throw new Error('The event editor context changed. Close and reopen it.');
      } };
  };
}
