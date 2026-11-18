import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';

/** URL prefix under which main.ts serves UPLOAD_DIR. */
export const UPLOADS_URL_PREFIX = '/uploads/';

/** Absolute path of the upload folder (UPLOAD_DIR, default "uploads"). */
export const uploadRoot = (dir: string | undefined) => {
  const value = dir?.trim() || 'uploads';
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
};

/**
 * Stores uploaded files on the local disk under UPLOAD_DIR and returns the
 * public URL path (/uploads/<folder>/<random>.<ext>). File names are random,
 * so callers never pass user input into a path. Swap this class for a cloud
 * store (S3, R2…) later without touching the callers.
 */
@Injectable()
export class LocalFileStorage {
  private readonly logger = new Logger(LocalFileStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = uploadRoot(config.get<string>('UPLOAD_DIR'));
  }

  /** Saves the bytes; returns the public URL path. */
  async save(
    folder: 'users' | 'shops',
    bytes: Buffer,
    ext: string,
  ): Promise<string> {
    const name = `${randomUUID()}.${ext}`;
    const dir = join(this.root, folder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), bytes, { flag: 'wx' });
    return `${UPLOADS_URL_PREFIX}${folder}/${name}`;
  }

  /**
   * Deletes a file previously returned by save(). Ignores URLs that are not
   * ours (external photo URLs) and files that are already gone.
   */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url?.startsWith(UPLOADS_URL_PREFIX)) return;
    const path = normalize(
      join(this.root, url.slice(UPLOADS_URL_PREFIX.length)),
    );
    if (!path.startsWith(this.root + sep)) return; // never leave the upload folder
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not delete ${url}: ${String(error)}`);
      }
    }
  }
}
