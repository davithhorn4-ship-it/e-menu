import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectPhotoType } from 'src/modules/users/user-photo';
import { LocalFileStorage } from './local-file-storage';

describe('LocalFileStorage', () => {
  let dir: string;
  let storage: LocalFileStorage;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emenu-uploads-'));
    storage = new LocalFileStorage(new ConfigService({ UPLOAD_DIR: dir }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('saves under a random name and returns its /uploads URL', async () => {
    const url = await storage.save('users', Buffer.from('abc'), 'png');
    expect(url).toMatch(/^\/uploads\/users\/[0-9a-f-]{36}\.png$/);
    expect(readFileSync(join(dir, url.slice('/uploads/'.length)), 'utf8')).toBe(
      'abc',
    );
  });

  it('removes its own files and ignores the rest', async () => {
    const url = await storage.save('users', Buffer.from('abc'), 'png');
    await storage.remove(url);
    expect(existsSync(join(dir, url.slice('/uploads/'.length)))).toBe(false);
    await expect(storage.remove(url)).resolves.toBeUndefined(); // already gone
    await expect(
      storage.remove('https://cdn.example.com/a.png'),
    ).resolves.toBeUndefined();
  });

  it('never deletes outside the upload folder', async () => {
    const outside = join(dir, '..', `outside-${Date.now()}.txt`);
    writeFileSync(outside, 'keep');
    try {
      await storage.remove(`/uploads/../${outside.split(/[\\/]/).pop()}`);
      expect(existsSync(outside)).toBe(true);
    } finally {
      rmSync(outside, { force: true });
    }
  });
});

describe('detectPhotoType', () => {
  it('recognises JPEG, PNG and WebP by their bytes', () => {
    expect(detectPhotoType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(
      detectPhotoType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('png');
    expect(detectPhotoType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))).toBe(
      'webp',
    );
  });

  it('refuses SVG, GIF, text and empty files', () => {
    expect(
      detectPhotoType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(detectPhotoType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectPhotoType(Buffer.from('hello'))).toBeNull();
    expect(detectPhotoType(Buffer.alloc(0))).toBeNull();
  });
});
