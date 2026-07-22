import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { imageUrl } from './api';
import type { Photo } from './types';

/** `originalPath` is a bare filename, but guard against stray path segments. */
function fileNameFor(photo: Photo): string {
  const base = photo.originalPath.split('/').pop();
  return base && base.length > 0 ? base : `photo-${photo.id}.jpg`;
}

async function shareFallback(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Could not save this photo');
  }
  await Sharing.shareAsync(uri);
}

/**
 * Save the full-resolution original.
 *
 * Web: fetched as a blob rather than pointed at with a plain `<a download>`,
 * because in local dev the backend is a different origin — browsers ignore the
 * download attribute cross-origin and navigate to the image instead.
 *
 * Native: `/images` sits behind the session cookie, which iOS's shared cookie
 * storage attaches to the download for us. The file lands in the cache
 * directory (system-reclaimable) and is then added to the photo library.
 *
 * Falls back to the share sheet whenever the library can't take it — the user
 * declined the permission prompt, or the original is a format Photos rejects
 * (raw/TIFF originals do exist in this library). The share sheet always has
 * somewhere to put the file, so a fallback beats an error.
 */
export async function downloadPhoto(photo: Photo): Promise<void> {
  const url = imageUrl(photo.originalPath);
  const name = fileNameFor(photo);

  if (Platform.OS === 'web') {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    return;
  }

  const file = await File.downloadFileAsync(url, new File(Paths.cache, name), {
    idempotent: true,
  });

  // writeOnly: adding to the library never needs to read the user's photos, and
  // the write-only prompt is the less alarming one.
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    await shareFallback(file.uri);
    return;
  }

  try {
    await MediaLibrary.Asset.create(file.uri);
  } catch {
    await shareFallback(file.uri);
  }
}
