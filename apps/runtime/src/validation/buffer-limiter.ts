export const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB

export class BoundedBuffer {
  private chunks: Buffer[] = [];
  private totalBytes = 0;
  private isTruncated = false;

  constructor(private readonly limit: number = MAX_OUTPUT_BYTES) {}

  public append(chunk: Buffer | string): void {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
    if (this.totalBytes + buf.length <= this.limit) {
      this.chunks.push(buf);
      this.totalBytes += buf.length;
    } else {
      const remaining = this.limit - this.totalBytes;
      if (remaining > 0) {
        this.chunks.push(buf.subarray(0, remaining));
        this.totalBytes += remaining;
      }
      this.isTruncated = true;
    }
  }

  public toString(): { content: string; truncated: boolean } {
    const text = Buffer.concat(this.chunks).toString('utf-8');
    return {
      content: this.isTruncated ? `${text}\n... [OUTPUT TRUNCATED AT 512KB] ...` : text,
      truncated: this.isTruncated,
    };
  }
}
