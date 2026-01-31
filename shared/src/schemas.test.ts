import { describe, expect, it } from 'vitest';
import { photoFiltersSchema } from './schemas.js';

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
