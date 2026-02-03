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
  orientation?: string;
  rating?: number;
  label?: string;
  keyword?: string;
  folder?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface StatsFilters {
  camera?: string;
  lens?: string;
  minIso?: number;
  maxIso?: number;
  minAperture?: number;
  maxAperture?: number;
  startDate?: string;
  endDate?: string;
  rating?: number;
  label?: string;
  keyword?: string;
  folder?: string;
}

export interface StatsResponse {
  totalPhotos: number;
  photosOverTime: { month: string; count: number }[];
  cameraDistribution: { camera: string; count: number }[];
  lensDistribution: { lens: string; count: number }[];
  focalLengthDistribution: { focalLength: number; count: number }[];
  apertureDistribution: { aperture: number; count: number }[];
  isoDistribution: { iso: number; count: number }[];
  aspectRatioDistribution: { aspectRatio: string; count: number }[];
  ratingDistribution: { rating: number; count: number }[];
  shutterSpeedDistribution: { shutterSpeed: string; count: number }[];
  photosByDayOfWeek: { day: string; count: number }[];
  photosByHourOfDay: { hour: number; count: number }[];
  // New stats
  photosByYear: { year: string; count: number }[];
  yearOverYear: { month: number; [year: string]: number }[];
  cameraLensCombinations: { camera: string; lens: string; count: number }[];
  photosByDate: { date: string; count: number }[];
  topDays: { date: string; count: number }[];
  cameraUsageOverTime: { month: string; camera: string; count: number }[];
  lensUsageOverTime: { month: string; lens: string; count: number }[];
  focalLengthVsAperture: { focalLength: number; aperture: number; count: number }[];
}
