// Each operation owns this closure. A new editor with identical field values
// must never revive an old operation after an A → B → A context transition.
export function eventContinuation({ client, actorId, token, getCurrent }) {
  const assertCurrent = () => {
    if (!token || getCurrent() !== token) throw new Error('The event editor context changed. Close and reopen it.');
  };
  return async () => {
    assertCurrent();
    const { data, error } = await client.auth.getUser();
    assertCurrent();
    if (error || !actorId || data?.user?.id !== actorId) throw new Error('The signed-in account changed. Close and reopen the event editor.');
  };
}
