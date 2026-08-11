import { describe, it, expect } from 'vitest';
import { isStaleChunkError } from '../../src/lib/reloadOnStaleChunk';

describe('isStaleChunkError', () => {
  it('detects Vite / webpack chunk load failures', () => {
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(
      true,
    );
    expect(isStaleChunkError(Object.assign(new Error('Loading chunk 5 failed'), { name: 'ChunkLoadError' }))).toBe(
      true,
    );
    expect(isStaleChunkError(new Error("Unexpected token '<'"))).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isStaleChunkError(new Error('Network timeout'))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});
