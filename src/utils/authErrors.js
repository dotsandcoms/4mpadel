export function authErrorMessage(error) {
    if (
        error?.name === 'AbortError'
        || error?.name === 'TimeoutError'
        || error?.name === 'AuthRetryableFetchError'
        || error?.status >= 500
        || (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
    ) {
        return 'Sign-in is temporarily unavailable. Please wait a moment and try again.';
    }
    return error?.message || 'Unable to sign in. Please try again.';
}
