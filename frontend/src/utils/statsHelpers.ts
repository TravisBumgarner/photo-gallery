const FOCAL_LENGTH_BINS = [
  { label: '14-24mm', min: 14, max: 24 },
  { label: '24-35mm', min: 24, max: 35 },
  { label: '35-50mm', min: 35, max: 50 },
  { label: '50-85mm', min: 50, max: 85 },
  { label: '85-135mm', min: 85, max: 135 },
  { label: '135-200mm', min: 135, max: 200 },
  { label: '200+mm', min: 200, max: Infinity },
];

/**
 * Bin focal length values into named ranges for chart display.
 */
export function binFocalLengths(
  data: { focalLength: number; count: number }[],
): { bin: string; count: number }[] {
  if (data.length === 0) return [];

  const counts = new Map<string, number>();

  for (const { focalLength, count } of data) {
    for (const bin of FOCAL_LENGTH_BINS) {
      if (focalLength >= bin.min && focalLength < bin.max) {
        counts.set(bin.label, (counts.get(bin.label) || 0) + count);
        break;
      }
      // Handle exact upper bound for the last finite bin
      if (bin.max === Infinity && focalLength >= bin.min) {
        counts.set(bin.label, (counts.get(bin.label) || 0) + count);
        break;
      }
    }
  }

  return FOCAL_LENGTH_BINS.filter((bin) => counts.has(bin.label)).map(
    (bin) => ({
      bin: bin.label,
      count: counts.get(bin.label)!,
    }),
  );
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Map numeric day-of-week (0-6) to day name (Sun-Sat).
 */
export function mapDayOfWeek(
  data: { day: string; count: number }[],
): { day: string; count: number }[] {
  return data.map(({ day, count }) => ({
    day: DAY_NAMES[parseInt(day, 10)] || day,
    count,
  }));
}
