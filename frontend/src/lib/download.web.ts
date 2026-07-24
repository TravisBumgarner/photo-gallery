import { imageUrl } from './api';
import type { Photo } from './types';

/** `originalPath` is a bare filename, but guard against stray path segments. */
function fileNameFor(photo: Photo): string {
  const base = photo.originalPath.split('/').pop();
  return base && base.length > 0 ? base : `photo-${photo.id}.jpg`;
}

/**
 * Save the full-resolution original.
 *
 * Fetched as a blob rather than pointed at with a plain `<a download>`,
 * because in local dev the backend is a different origin — browsers ignore the
 * download attribute cross-origin and navigate to the image instead.
 *
 * This web variant exists so the web bundle never imports expo-media-library:
 * that package has no web support in SDK 56 and throws "Cannot find native
 * module 'ExpoMediaLibraryNext'" at import time, crashing the app on load.
 */
export async function downloadPhoto(photo: Photo): Promise<void> {
  const url = imageUrl(photo.originalPath);
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileNameFor(photo);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
