import { getServerUrl } from './serverUrl';

/**
 * Backend URL for a photo thumbnail. `thumbnailPath` already includes the
 * `thumbnails/` prefix (e.g. `thumbnails/thumb_xxx.jpg`) — we just normalize
 * the leading slash.
 */
export function thumbnailUrl(thumbnailPath: string): string {
  const normalized = thumbnailPath.startsWith('/')
    ? thumbnailPath
    : `/${thumbnailPath}`;
  return `${getServerUrl()}${normalized}`;
}

/**
 * Backend URL for a full-size image. `originalPath` is just the filename
 * (no `images/` prefix), so we prepend the `/images/` route ourselves.
 */
export function imageUrl(originalPath: string): string {
  const normalized = originalPath.startsWith('/')
    ? originalPath.slice(1)
    : originalPath;
  return `${getServerUrl()}/images/${normalized}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${getServerUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}
