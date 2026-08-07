import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, createHmac, randomBytes } from 'crypto';

@Injectable()
export class StorageService implements OnModuleInit {
  private root = process.env.STORAGE_PATH || '/tmp/kernle-assets';
  private signingSecret = process.env.STORAGE_SIGNING_SECRET || 'kernle-dev-storage-secret';

  async onModuleInit() {
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(path.join(this.root, 'thumbs'), { recursive: true });
  }

  getRoot() {
    return this.root;
  }

  private orgDir(organizationId: string) {
    return path.join(this.root, organizationId);
  }

  async putObject(
    organizationId: string,
    key: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<{ storageKey: string; absolutePath: string; size: number }> {
    const storageKey = `${organizationId}/${key}`;
    const absolutePath = path.join(this.root, storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    // sidecar content-type
    if (contentType) {
      await fs.writeFile(`${absolutePath}.meta.json`, JSON.stringify({ contentType }), 'utf8');
    }
    return { storageKey, absolutePath, size: buffer.length };
  }

  async getObject(storageKey: string): Promise<Buffer> {
    return fs.readFile(path.join(this.root, storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.root, storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.root, storageKey));
    } catch {
      /* ignore */
    }
  }

  /** Mimic S3 pre-signed URL with HMAC expiry. */
  getSignedUrl(storageKey: string, expiresInSeconds = 3600): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${storageKey}:${expires}`;
    const sig = createHmac('sha256', this.signingSecret).update(payload).digest('hex');
    const base = process.env.API_PUBLIC_URL || 'http://localhost:3000';
    return `${base}/api/dam/files/${encodeURIComponent(storageKey)}?expires=${expires}&sig=${sig}`;
  }

  verifySignedUrl(storageKey: string, expires: string, sig: string): boolean {
    const exp = Number(expires);
    if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
    const payload = `${storageKey}:${exp}`;
    const expected = createHmac('sha256', this.signingSecret).update(payload).digest('hex');
    return expected === sig;
  }

  async makeUniqueKey(filename: string): Promise<string> {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
    const hash = createHash('sha1').update(randomBytes(16)).digest('hex').slice(0, 12);
    return `${Date.now()}-${hash}-${base}${ext}`;
  }
}
