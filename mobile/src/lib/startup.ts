export const STARTUP_TIMEOUT_MS = 8000;

/** A stalled native storage call or session refresh must not leave the splash up forever. */
export function withStartupDeadline<T>(task: PromiseLike<T>, timeoutMs = STARTUP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup timed out')), timeoutMs);
    Promise.resolve(task).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}
