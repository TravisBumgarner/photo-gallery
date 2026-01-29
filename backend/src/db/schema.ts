import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

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
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
