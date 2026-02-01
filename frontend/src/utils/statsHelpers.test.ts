import { describe, expect, it } from 'vitest';
import { binFocalLengths, mapDayOfWeek } from './statsHelpers';

describe('binFocalLengths', () => {
  it('groups focal lengths into correct bins', () => {
    const data = [
      { focalLength: 16, count: 5 },
      { focalLength: 24, count: 10 },
      { focalLength: 35, count: 8 },
      { focalLength: 50, count: 20 },
      { focalLength: 85, count: 15 },
      { focalLength: 135, count: 3 },
      { focalLength: 200, count: 2 },
      { focalLength: 400, count: 1 },
    ];
    const result = binFocalLengths(data);
    expect(result).toEqual([
      { bin: '14-24mm', count: 5 },
      { bin: '24-35mm', count: 10 },
      { bin: '35-50mm', count: 8 },
      { bin: '50-85mm', count: 20 },
      { bin: '85-135mm', count: 15 },
      { bin: '135-200mm', count: 3 },
      { bin: '200+mm', count: 3 },
    ]);
  });

  it('accumulates counts within the same bin', () => {
    const data = [
      { focalLength: 14, count: 3 },
      { focalLength: 20, count: 7 },
    ];
    const result = binFocalLengths(data);
    expect(result).toEqual([{ bin: '14-24mm', count: 10 }]);
  });

  it('omits bins with zero count', () => {
    const data = [{ focalLength: 50, count: 5 }];
    const result = binFocalLengths(data);
    expect(result).toEqual([{ bin: '50-85mm', count: 5 }]);
  });

  it('returns empty array for empty input', () => {
    expect(binFocalLengths([])).toEqual([]);
  });
});

describe('mapDayOfWeek', () => {
  it('maps numeric days to names', () => {
    const data = [
      { day: '0', count: 10 },
      { day: '1', count: 20 },
      { day: '6', count: 5 },
    ];
    const result = mapDayOfWeek(data);
    expect(result).toEqual([
      { day: 'Sun', count: 10 },
      { day: 'Mon', count: 20 },
      { day: 'Sat', count: 5 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(mapDayOfWeek([])).toEqual([]);
  });
});
