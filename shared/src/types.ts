import type { photos, users } from './db/schema.js';

// DB-level types (Date objects for timestamp columns)
export type Photo = typeof photos.$inferSelect;
export type PhotoInsert = typeof photos.$inferInsert;
export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

// API-level type: dates are serialized to strings over JSON
export type ApiPhoto = Omit<
  Photo,
  'dateCaptured' | 'createdAt' | 'updatedAt'
> & {
  dateCaptured: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PhotosResponse {
  photos: ApiPhoto[];
  pagination: Pagination;
}

export interface PhotoFilters {
  search?: string;
  camera?: string;
  lens?: string;
  minIso?: number;
  maxIso?: number;
  minAperture?: number;
  maxAperture?: number;
  startDate?: string;
  endDate?: string;
  aspectRatio?: string;
  rating?: number;
  label?: string;
  keyword?: string;
  folder?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
