import { describe, expect, it } from 'vitest';
import { suggestedPrintPage } from '../../src/lib/choosePrintPage';

describe('suggestedPrintPage', () => {
  it('suggests half page when there are few items', () => {
    expect(suggestedPrintPage(1)).toBe('half');
    expect(suggestedPrintPage(8)).toBe('half');
  });

  it('suggests full page when the bill is longer', () => {
    expect(suggestedPrintPage(9)).toBe('full');
    expect(suggestedPrintPage(0)).toBe('full');
  });
});
