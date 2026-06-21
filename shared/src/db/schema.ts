import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const photos = sqliteTable(
  'photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uuid: text('uuid').notNull().unique(),
    // SHA256 of the source file bytes. The stable per-detection anchor for
    // reattaching labels (labels.json) across re-clustering. Nullable for rows
    // written before this column existed.
    contentHash: text('content_hash'),
    filename: text('filename').notNull(),
    originalPath: text('original_path').notNull(),
    thumbnailPath: text('thumbnail_path').notNull(),
    blurhash: text('blurhash').notNull(),

    // Dimensions
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    aspectRatio: real('aspect_ratio').notNull(),

    // EXIF data
    camera: text('camera'),
    lens: text('lens'),
    dateCaptured: integer('date_captured', { mode: 'timestamp' }),
    iso: integer('iso'),
    shutterSpeed: text('shutter_speed'),
    aperture: real('aperture'),
    focalLength: real('focal_length'),
    keywords: text('keywords'), // JSON array stored as string

    // Lightroom metadata
    rating: integer('rating'), // 0-5 stars
    label: text('label'), // Red, Yellow, Green, Blue, Purple

    // Metadata
    fileSize: integer('file_size'),
    mimeType: text('mime_type'),

    // Content tagging (populated by `npm run tag`)
    tags: text('tags'),
    tagsEmbedding: blob('tags_embedding', { mode: 'buffer' }),

    // Face detection (populated by `npm run detect-faces`).
    // Set to a timestamp once detection has run for this photo even if zero
    // faces were found, so re-runs don't reprocess it.
    facesProcessedAt: integer('faces_processed_at', { mode: 'timestamp' }),

    // Dog detection (populated by `npm run detect-dogs`). Same idea as faces.
    dogsProcessedAt: integer('dogs_processed_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => ({
    dateCapturedIdx: index('idx_photos_date_captured').on(table.dateCaptured),
    cameraIdx: index('idx_photos_camera').on(table.camera),
    lensIdx: index('idx_photos_lens').on(table.lens),
    isoIdx: index('idx_photos_iso').on(table.iso),
    apertureIdx: index('idx_photos_aperture').on(table.aperture),
    ratingIdx: index('idx_photos_rating').on(table.rating),
    labelIdx: index('idx_photos_label').on(table.label),
    aspectRatioIdx: index('idx_photos_aspect_ratio').on(table.aspectRatio),
    createdAtIdx: index('idx_photos_created_at').on(table.createdAt),
    filenameIdx: index('idx_photos_filename').on(table.filename),
    contentHashIdx: index('idx_photos_content_hash').on(table.contentHash),
    facesProcessedAtIdx: index('idx_photos_faces_processed_at').on(
      table.facesProcessedAt,
    ),
    dogsProcessedAtIdx: index('idx_photos_dogs_processed_at').on(
      table.dogsProcessedAt,
    ),
  }),
);

// One row per labeled (or unlabeled) group of similar faces. Clustering writes
// these; the labeling UI sets `personLabel`. `ignored` marks clusters the user
// has dismissed (strangers, false-positive non-faces) so they don't keep
// reappearing in the labeling queue.
export const faceClusters = sqliteTable('face_clusters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personLabel: text('person_label'),
  ignored: integer('ignored', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

// One row per detected face. bbox stored as normalized 0..1 coords so it works
// against any rendition of the photo (original, thumbnail).
export const faces = sqliteTable(
  'faces',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    photoUuid: text('photo_uuid').notNull(),
    bboxX: real('bbox_x').notNull(),
    bboxY: real('bbox_y').notNull(),
    bboxW: real('bbox_w').notNull(),
    bboxH: real('bbox_h').notNull(),
    detScore: real('det_score').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }).notNull(),
    clusterId: integer('cluster_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => ({
    photoUuidIdx: index('idx_faces_photo_uuid').on(table.photoUuid),
    clusterIdIdx: index('idx_faces_cluster_id').on(table.clusterId),
  }),
);

// Dogs mirror faces but use DINOv2 (384-d, instance-aware) embeddings instead
// of ArcFace. Separate tables instead of a generic `subjects` table to keep
// the people pipeline untouched and the schema readable.
export const dogClusters = sqliteTable('dog_clusters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dogLabel: text('dog_label'),
  ignored: integer('ignored', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

export const dogs = sqliteTable(
  'dogs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    photoUuid: text('photo_uuid').notNull(),
    bboxX: real('bbox_x').notNull(),
    bboxY: real('bbox_y').notNull(),
    bboxW: real('bbox_w').notNull(),
    bboxH: real('bbox_h').notNull(),
    detScore: real('det_score').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }).notNull(),
    clusterId: integer('cluster_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => ({
    photoUuidIdx: index('idx_dogs_photo_uuid').on(table.photoUuid),
    clusterIdIdx: index('idx_dogs_cluster_id').on(table.clusterId),
  }),
);
