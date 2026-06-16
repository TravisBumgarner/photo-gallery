import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageBackend } from './index.js';

/**
 * S3-compatible backend. Works with AWS S3, Cloudflare R2, DigitalOcean Spaces,
 * Backblaze B2, and MinIO — set STORAGE_S3_ENDPOINT for non-AWS providers.
 *
 *   s3://my-bucket            -> bucket root
 *   s3://my-bucket/prefix     -> all keys under prefix/
 *
 * Credentials come from STORAGE_S3_ACCESS_KEY_ID / _SECRET_ACCESS_KEY if set,
 * else the default AWS provider chain (env, shared config, instance role).
 */
export class S3Storage implements StorageBackend {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(bucket: string, prefix: string) {
    this.bucket = bucket;
    this.prefix = prefix ? prefix.replace(/\/$/, '') : '';

    const endpoint = process.env.STORAGE_S3_ENDPOINT;
    const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    this.client = new S3Client({
      region: process.env.STORAGE_S3_REGION ?? 'us-east-1',
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key), Body: data }),
    );
  }

  async putFile(key: string, filePath: string): Promise<void> {
    const { size } = await fs.stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.fullKey(key),
        Body: createReadStream(filePath),
        ContentLength: size,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async getToFile(key: string, destPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }),
    );
    const { createWriteStream } = await import('node:fs');
    await pipeline(res.Body as Readable, createWriteStream(destPath));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }),
      );
      return true;
    } catch (err: unknown) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const fullPrefix = this.fullKey(prefix);
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: fullPrefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        // Return keys relative to the base prefix, matching LocalStorage.
        keys.push(this.prefix ? obj.Key.slice(this.prefix.length + 1) : obj.Key);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }),
    );
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}
