import { describe, expect, it } from 'vitest';
import { photoFiltersSchema, statsFiltersSchema } from './schemas.js';

describe('photoFiltersSchema', () => {
  describe('lens field', () => {
    it('defaults lens to empty string when not provided', () => {
      const result = photoFiltersSchema.parse({});
      expect(result.lens).toBe('');
    });

    it('accepts a lens string value', () => {
      const result = photoFiltersSchema.parse({ lens: 'RF 50mm F1.8 STM' });
      expect(result.lens).toBe('RF 50mm F1.8 STM');
    });

    it('accepts an empty lens string', () => {
      const result = photoFiltersSchema.parse({ lens: '' });
      expect(result.lens).toBe('');
    });
  });

  describe('lens field alongside existing filters', () => {
    it('parses lens together with camera filter', () => {
      const result = photoFiltersSchema.parse({
        camera: 'Canon EOS R6',
        lens: 'RF 50mm F1.8 STM',
      });
      expect(result.camera).toBe('Canon EOS R6');
      expect(result.lens).toBe('RF 50mm F1.8 STM');
    });

    it('includes lens in full query parameter parsing', () => {
      const result = photoFiltersSchema.parse({
        page: '2',
        limit: '50',
        lens: 'EF 24-70mm f/2.8L',
        camera: 'Canon',
        sortBy: 'dateCaptured',
        sortOrder: 'asc',
      });
      expect(result.lens).toBe('EF 24-70mm f/2.8L');
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });
  });
});

describe('statsFiltersSchema', () => {
  it('parses an empty object with defaults', () => {
    const result = statsFiltersSchema.parse({});
    expect(result.camera).toBe('');
    expect(result.lens).toBe('');
    expect(result.label).toBe('');
    expect(result.keyword).toBe('');
    expect(result.folder).toBe('');
  });

  it('accepts camera and lens string values', () => {
    const result = statsFiltersSchema.parse({
      camera: 'NIKON Z 6_2',
      lens: 'NIKKOR Z 50mm f/1.8 S',
    });
    expect(result.camera).toBe('NIKON Z 6_2');
    expect(result.lens).toBe('NIKKOR Z 50mm f/1.8 S');
  });

  it('coerces numeric string values for ISO range', () => {
    const result = statsFiltersSchema.parse({
      minIso: '100',
      maxIso: '6400',
    });
    expect(result.minIso).toBe(100);
    expect(result.maxIso).toBe(6400);
  });

  it('coerces numeric string values for aperture range', () => {
    const result = statsFiltersSchema.parse({
      minAperture: '1.4',
      maxAperture: '22',
    });
    expect(result.minAperture).toBe(1.4);
    expect(result.maxAperture).toBe(22);
  });

  it('accepts date range strings', () => {
    const result = statsFiltersSchema.parse({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    expect(result.startDate).toBe('2024-01-01');
    expect(result.endDate).toBe('2024-12-31');
  });

  it('coerces rating from string to number', () => {
    const result = statsFiltersSchema.parse({ rating: '3' });
    expect(result.rating).toBe(3);
  });

  it('accepts keyword and folder filters', () => {
    const result = statsFiltersSchema.parse({
      keyword: 'landscape,sunset',
      folder: 'trips/japan',
    });
    expect(result.keyword).toBe('landscape,sunset');
    expect(result.folder).toBe('trips/japan');
  });

  it('does not include page, limit, sortBy, or sortOrder fields', () => {
    const result = statsFiltersSchema.parse({
      page: '5',
      limit: '100',
      sortBy: 'dateCaptured',
      sortOrder: 'asc',
    });
    expect(result).not.toHaveProperty('page');
    expect(result).not.toHaveProperty('limit');
    expect(result).not.toHaveProperty('sortBy');
    expect(result).not.toHaveProperty('sortOrder');
  });

  it('leaves optional numeric fields undefined when not provided', () => {
    const result = statsFiltersSchema.parse({});
    expect(result.minIso).toBeUndefined();
    expect(result.maxIso).toBeUndefined();
    expect(result.minAperture).toBeUndefined();
    expect(result.maxAperture).toBeUndefined();
    expect(result.rating).toBeUndefined();
  });
});
