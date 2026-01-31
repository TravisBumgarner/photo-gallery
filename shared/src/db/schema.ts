import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
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

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
}, (table) => ({
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
}));

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});
