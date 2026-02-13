import { z } from 'zod';

export const photoFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().default(''),
  camera: z.string().default(''),
  lens: z.string().default(''),
  minIso: z.coerce.number().optional(),
  maxIso: z.coerce.number().optional(),
  minAperture: z.coerce.number().optional(),
  maxAperture: z.coerce.number().optional(),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  selectedMonths: z.string().default(''),
  selectedDates: z.string().default(''),
  aspectRatio: z.string().default(''),
  orientation: z.string().default(''),
  rating: z.coerce.number().int().optional(),
  label: z.string().default(''),
  keyword: z.string().default(''),
  folder: z.string().default(''),
  sortBy: z
    .enum(['dateCaptured', 'filename', 'rating', 'createdAt'])
    .default('dateCaptured'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PhotoFiltersInput = z.input<typeof photoFiltersSchema>;
export type PhotoFiltersParsed = z.output<typeof photoFiltersSchema>;

export const statsFiltersSchema = z.object({
  camera: z.string().default(''),
  lens: z.string().default(''),
  minIso: z.coerce.number().optional(),
  maxIso: z.coerce.number().optional(),
  minAperture: z.coerce.number().optional(),
  maxAperture: z.coerce.number().optional(),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  selectedMonths: z.string().default(''),
  selectedDates: z.string().default(''),
  rating: z.coerce.number().int().optional(),
  label: z.string().default(''),
  keyword: z.string().default(''),
  folder: z.string().default(''),
});
