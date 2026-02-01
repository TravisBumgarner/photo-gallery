/**
 * Bin focal length values into named ranges for chart display.
 * Bins: 14-24, 24-35, 35-50, 50-85, 85-135, 135-200, 200+
 */
export function binFocalLengths(
  _data: { focalLength: number; count: number }[],
): { bin: string; count: number }[] {
  return [];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Map numeric day-of-week (0-6) to day name (Sun-Sat).
 */
export function mapDayOfWeek(
  _data: { day: string; count: number }[],
): { day: string; count: number }[] {
  return [];
}
