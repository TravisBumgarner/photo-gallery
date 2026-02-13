import { describe, expect, it } from 'vitest';
import type { Photo } from '@/types';
import { groupPhotosBySort } from './groupPhotos';

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 1,
    uuid: 'test',
    filename: 'photo.jpg',
    originalPath: '/img/photo.jpg',
    thumbnailPath: '/thumb/photo.jpg',
    blurhash: 'abc',
    width: 4000,
    height: 3000,
    aspectRatio: 1.33,
    camera: null,
    lens: null,
    dateCaptured: null,
    iso: null,
    shutterSpeed: null,
    aperture: null,
    focalLength: null,
    keywords: null,
    rating: null,
    label: null,
    fileSize: null,
    mimeType: null,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('groupPhotosBySort', () => {
  it('groups photos by ISO value', () => {
    const photos = [
      makePhoto({ id: 1, iso: 100 }),
      makePhoto({ id: 2, iso: 400 }),
      makePhoto({ id: 3, iso: 100 }),
    ];

    const sections = groupPhotosBySort(photos, 'iso');
    expect(sections).toHaveLength(2);
    expect(sections[0].photos).toHaveLength(2);
    expect(sections[0].label).toContain('100');
    expect(sections[1].photos).toHaveLength(1);
    expect(sections[1].label).toContain('400');
  });

  it('groups photos by camera name', () => {
    const photos = [
      makePhoto({ id: 1, camera: 'Canon EOS R6' }),
      makePhoto({ id: 2, camera: 'NIKON Z 6_2' }),
      makePhoto({ id: 3, camera: 'Canon EOS R6' }),
    ];

    const sections = groupPhotosBySort(photos, 'camera');
    expect(sections).toHaveLength(2);
    expect(sections[0].photos).toHaveLength(2);
    expect(sections[1].photos).toHaveLength(1);
  });

  it('groups photos by date captured into day groups', () => {
    const photos = [
      makePhoto({ id: 1, dateCaptured: '2024-01-15T10:00:00Z' }),
      makePhoto({ id: 2, dateCaptured: '2024-01-15T18:00:00Z' }),
      makePhoto({ id: 3, dateCaptured: '2024-03-22T12:00:00Z' }),
    ];

    const sections = groupPhotosBySort(photos, 'dateCaptured');
    expect(sections).toHaveLength(2);
    expect(sections[0].photos).toHaveLength(2);
    expect(sections[1].photos).toHaveLength(1);
  });

  it('puts photos with null sort field values into an "Unknown" group', () => {
    const photos = [
      makePhoto({ id: 1, iso: 200 }),
      makePhoto({ id: 2, iso: null }),
    ];

    const sections = groupPhotosBySort(photos, 'iso');
    expect(sections).toHaveLength(2);
    const unknownSection = sections.find((s) => s.label.toLowerCase().includes('unknown'));
    expect(unknownSection).toBeDefined();
    expect(unknownSection!.photos).toHaveLength(1);
  });

  it('preserves photo order within each section', () => {
    const photos = [
      makePhoto({ id: 1, iso: 100 }),
      makePhoto({ id: 2, iso: 100 }),
      makePhoto({ id: 3, iso: 100 }),
    ];

    const sections = groupPhotosBySort(photos, 'iso');
    expect(sections).toHaveLength(1);
    expect(sections[0].photos.map((p) => p.id)).toEqual([1, 2, 3]);
  });
});
