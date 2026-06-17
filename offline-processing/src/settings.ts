import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// Tuning / behavior knobs, separate from environment & secrets (those live in
// .cli-cache and are loaded by config.ts). Everything here is read from
// offline-processing.config.yaml at the package root. The file is optional and
// partial: any key you omit falls back to the default below, so a missing file
// reproduces the original hard-coded behavior exactly.
//
// Override the file location with OP_CONFIG_PATH (the Docker image sets this).

export const DEFAULT_TAG_PROMPT = `Generate search tags for this image. Output 15-20 comma-separated tags covering:
- Concrete subjects (people, objects, animals)
- Setting/location (indoor/outdoor, specific place type)
- Visual attributes (dominant colors, lighting, composition)
- Style/medium (photo, illustration, screenshot, etc.)
- Mood or activity
Use lowercase, single words or short phrases. No explanations.`;

const quality = () => z.number().int().min(1).max(100);

const settingsSchema = z
  .object({
    images: z
      .object({
        thumbnail: z
          .object({
            // Longest-edge width in px for grid thumbnails.
            width: z.number().int().positive().default(300),
            quality: quality().default(85),
          })
          .default({}),
        full: z
          .object({
            // null = store the original untouched (default, original behavior).
            // A number caps the longest edge in px, re-encoding jpg/png/webp.
            maxDimension: z.number().int().positive().nullable().default(null),
            quality: quality().default(90),
          })
          .default({}),
        blurhash: z
          .object({
            componentsX: z.number().int().min(1).max(9).default(4),
            componentsY: z.number().int().min(1).max(9).default(3),
          })
          .default({}),
      })
      .default({}),
    ingest: z
      .object({
        // Images processed per parallel batch during scan/ingest.
        batchSize: z.number().int().positive().default(20),
      })
      .default({}),
    tagging: z
      .object({
        // Sliding-window concurrency of in-flight vision-LLM requests.
        concurrency: z.number().int().positive().default(2000),
        prompt: z.string().min(1).default(DEFAULT_TAG_PROMPT),
      })
      .default({}),
    faces: z
      .object({
        detect: z
          .object({ concurrency: z.number().int().positive().default(4) })
          .default({}),
        cluster: z
          .object({
            eps: z.number().positive().default(0.45),
            minPts: z.number().int().positive().default(3),
            stickyAssignDist: z.number().positive().default(0.45),
          })
          .default({}),
      })
      .default({}),
    dogs: z
      .object({
        detect: z
          .object({ concurrency: z.number().int().positive().default(2) })
          .default({}),
        cluster: z
          .object({
            eps: z.number().positive().default(0.35),
            minPts: z.number().int().positive().default(3),
            stickyAssignDist: z.number().positive().default(0.35),
          })
          .default({}),
      })
      .default({}),
    labelApp: z
      .object({
        port: z.number().int().positive().default(5180),
        sampleFacesPerCluster: z.number().int().positive().default(9),
      })
      .default({}),
  })
  .default({});

export type Settings = z.infer<typeof settingsSchema>;

function resolveConfigPath(): string {
  if (process.env.OP_CONFIG_PATH)
    return path.resolve(process.env.OP_CONFIG_PATH);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', 'offline-processing.config.yaml');
}

function loadSettings(): Settings {
  const configPath = resolveConfigPath();
  let raw: unknown = {};
  try {
    raw = parseYaml(fs.readFileSync(configPath, 'utf8')) ?? {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(
        `[settings] ${configPath} could not be read (${(err as Error).message}); using defaults.`,
      );
    }
  }
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `[settings] ${configPath} is invalid; using defaults.\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
    return settingsSchema.parse({});
  }
  return parsed.data;
}

export const settings: Settings = loadSettings();
