export interface Photo {
  id: number;
  uuid: string;
  filename: string;
  originalPath: string;
  thumbnailPath: string;
  blurhash: string;
  width: number;
  height: number;
  aspectRatio: number;
  camera: string | null;
  lens: string | null;
  dateCaptured: string | null;
  iso: number | null;
  shutterSpeed: string | null;
  aperture: number | null;
  focalLength: number | null;
  keywords: string | null;
  rating: number | null;
  label: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhotosResponse {
  photos: Photo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface PhotoFilters {
  search?: string;
  camera?: string;
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
