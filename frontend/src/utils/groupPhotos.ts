import type { Photo } from '@/types';

export interface PhotoSection {
  key: string;
  label: string;
  photos: Photo[];
}

function getGroupKey(photo: Photo, sortBy: string): string {
  switch (sortBy) {
    case 'iso':
      return photo.iso != null ? String(photo.iso) : '__unknown__';
    case 'aperture':
      return photo.aperture != null ? String(photo.aperture) : '__unknown__';
    case 'dateCaptured':
      return photo.dateCaptured ? photo.dateCaptured.substring(0, 10) : '__unknown__';
    case 'createdAt':
      return photo.createdAt ? photo.createdAt.substring(0, 10) : '__unknown__';
    case 'camera':
      return photo.camera ?? '__unknown__';
    case 'filename':
      return photo.filename ? photo.filename[0].toUpperCase() : '__unknown__';
    default:
      return '__unknown__';
  }
}

function getGroupLabel(key: string, sortBy: string): string {
  if (key === '__unknown__') return 'Unknown';
  switch (sortBy) {
    case 'iso':
      return `ISO ${key}`;
    case 'aperture':
      return `f/${key}`;
    case 'dateCaptured':
    case 'createdAt':
      return key;
    case 'camera':
      return key;
    case 'filename':
      return key;
    default:
      return key;
  }
}

/** Group a flat photo array into sections based on the current sort field. */
export function groupPhotosBySort(
  photos: Photo[],
  sortBy: string,
): PhotoSection[] {
  const sections: PhotoSection[] = [];
  const sectionMap = new Map<string, PhotoSection>();

  for (const photo of photos) {
    const key = getGroupKey(photo, sortBy);
    let section = sectionMap.get(key);
    if (!section) {
      section = { key, label: getGroupLabel(key, sortBy), photos: [] };
      sectionMap.set(key, section);
      sections.push(section);
    }
    section.photos.push(photo);
  }

  return sections;
}
