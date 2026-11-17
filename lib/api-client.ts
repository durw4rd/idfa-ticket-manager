// Reading the app's own JSON API from client components

/** Send the browser to sign in, coming back to this page afterwards */
export function redirectToSignIn(): void {
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/login?callbackUrl=${encodeURIComponent(here)}`);
}

/**
 * The JSON body of an API response, or an Error with the route's `error` message. A 401 means the
 * session ran out (sessions last 30 days): the browser goes to sign in and the caller gets an error
 * to show meanwhile. Bodies that aren't JSON (a proxy's error page) fall back to `fallbackMessage`.
 */
export async function readApiResponse<T = Record<string, unknown>>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.status === 401) {
    redirectToSignIn();
    throw new Error('Your session has ended. Taking you to sign in…');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === 'string' && data.error ? data.error : fallbackMessage;
    throw new Error(message);
  }
  return data as T;
}
