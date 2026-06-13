import type { StatsFilters, StatsResponse } from 'shared/types';

import { apiFetch } from './api';

export async function fetchStats(
  filters: StatsFilters,
  signal?: AbortSignal,
): Promise<StatsResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') {
      params.append(k, String(v));
    }
  }
  const qs = params.toString();
  const url = qs ? `/api/photos/stats?${qs}` : '/api/photos/stats';
  const response = await apiFetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
