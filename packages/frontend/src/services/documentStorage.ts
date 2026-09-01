/**
 * Document persistence and shareable links.
 *
 * Priority on load: a `#fpd=` share link in the URL wins over the last
 * locally-saved document, which wins over the bundled default example.
 * The share link encodes the full FPD source, lz-compressed, in the URL
 * fragment — nothing is sent to a server.
 */

import { decompressFromEncodedURIComponent } from 'lz-string';

const STORAGE_KEY = 'fpd-editor.document';
const HASH_PREFIX = '#fpd=';

/** Resolve the source the editor should start with. */
export function loadInitialSource(defaultSource: string): string {
    const hash = window.location.hash;
    if (hash.startsWith(HASH_PREFIX)) {
        const source = decompressFromEncodedURIComponent(hash.slice(HASH_PREFIX.length));
        if (source && source.trim()) {
            return source;
        }
    }

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored !== null && stored.trim()) {
            return stored;
        }
    } catch {
        // localStorage unavailable (private mode, storage policy) — fall through.
    }

    return defaultSource;
}

/** Persist the current document locally. Failures (quota, private mode) are ignored. */
export function saveSource(source: string): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, source);
    } catch {
        // Best-effort only.
    }
}
