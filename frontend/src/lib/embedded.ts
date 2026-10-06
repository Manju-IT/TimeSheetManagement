/** True when the app URL contains ?embedded=1. */
export function isEmbedded(): boolean {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('embedded') === '1';
}

/** URL to the same page without ?embedded=1, suitable for a new browser tab. */
export function fullAppUrl(): string {
    if (typeof window === 'undefined') return '/';
    const url = new URL(window.location.href);
    url.searchParams.delete('embedded');
    return url.toString();
}