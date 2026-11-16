// Where to send someone after sign-in. callbackUrl comes from the address bar, so only paths on
// this site are followed; everything else goes to the agenda.

const DEFAULT_PATH = '/screenings';
// Placeholder origin for parsing: the URL parser drops tabs and newlines and treats "\" like "/",
// so "/\t/evil.example" or "/\evil.example" only show their real target once parsed
const BASE = 'https://app.invalid';

export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(raw)) {
    return DEFAULT_PATH;
  }
  try {
    const url = new URL(raw, BASE);
    return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : DEFAULT_PATH;
  } catch {
    return DEFAULT_PATH;
  }
}
