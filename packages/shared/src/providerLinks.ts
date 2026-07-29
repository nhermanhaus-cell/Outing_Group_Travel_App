export function isExactViatorProductUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/$/, '');
    return (host === 'viator.com' || host.endsWith('.viator.com')) && path.length > 1 && !path.includes('searchresults');
  } catch { return false; }
}
