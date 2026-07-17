import { describe, it, expect } from 'vitest';
import { parsePagination, assertBulkSize } from '../../server/utils/pagination';

describe('parsePagination', () => {
  it('applies defaults and clamps limit', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 500, offset: 0 });
    expect(parsePagination({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50, offset: 50 });
    expect(parsePagination({ limit: '99999' }).limit).toBe(1000);
    expect(parsePagination({ page: '0', limit: '-5' })).toEqual({ page: 1, limit: 500, offset: 0 });
  });
});

describe('assertBulkSize', () => {
  it('rejects empty, oversized, and non-arrays', () => {
    expect(assertBulkSize(null)).toBeTruthy();
    expect(assertBulkSize([])).toBeTruthy();
    expect(assertBulkSize(new Array(501).fill({}))).toMatch(/max 500/);
    expect(assertBulkSize([{ a: 1 }])).toBeNull();
  });
});
