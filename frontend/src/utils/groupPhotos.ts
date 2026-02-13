import type { Photo } from '@/types';

export interface PhotoSection {
  key: string;
  label: string;
  photos: Photo[];
}

/** Group a flat photo array into sections based on the current sort field. */
export function groupPhotosBySort(
  photos: Photo[],
  sortBy: string,
): PhotoSection[] {
  return [];
}
