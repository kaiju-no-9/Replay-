/**
 * Rolling memory buffer capped at a strict byte size (default 1MB).
 * Drops oldest chunks when capacity is exceeded to avoid memory exhaustion.
 */
export class ScrollbackBuffer {
  private chunks: Buffer[] = [];
  private totalBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number = 1024 * 1024) {
    this.maxBytes = maxBytes;
  }

  append(data: string | Buffer): void {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;

    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift();
      if (removed) {
        this.totalBytes -= removed.length;
      }
    }
  }

  getSnapshot(): string {
    return Buffer.concat(this.chunks).toString('utf-8');
  }

  getByteCount(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }
}
