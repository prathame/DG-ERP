import { describe, it, expect } from 'vitest';
import { computeA4LabelGrid, mmToPx, renderLabelsPrintHtml } from '../../src/lib/barcodeLabelRender';
import {
  defaultStarterTemplate,
  SAMPLE_LABEL_CONTEXT,
  type LabelPrintContext,
} from '../../shared/barcodeLabelTemplate';
import { withPrintPagination } from '../../src/lib/utils';

function textOnlyTemplate() {
  const t = defaultStarterTemplate();
  return {
    ...t,
    elements: t.elements.filter(el => el.type !== 'barcode' && el.type !== 'qr'),
  };
}

describe('barcode label render helpers', () => {
  it('converts millimeters to pixels with optional scale', () => {
    const base = mmToPx(10);
    expect(base).toBeGreaterThan(37);
    expect(base).toBeLessThan(38);
    expect(mmToPx(10, 2)).toBeCloseTo(base * 2, 5);
    expect(mmToPx(38)).toBeGreaterThan(mmToPx(25));
  });

  it('computes A4 grid for 38×25 mm labels', () => {
    const grid = computeA4LabelGrid(38, 25);
    expect(grid.cols).toBe(5);
    expect(grid.rows).toBe(11);
    expect(grid.perPage).toBe(55);
    expect(grid.pageWidthMm).toBe(210);
    expect(grid.pageHeightMm).toBe(297);
    expect(grid.marginMm).toBe(5);
  });

  it('renderLabelsPrintHtml a4-sheet includes grid pages and label cells', async () => {
    const template = textOnlyTemplate();
    const contexts: LabelPrintContext[] = Array.from({ length: 6 }, () => SAMPLE_LABEL_CONTEXT);
    const html = await renderLabelsPrintHtml(template, contexts, 'a4-sheet');

    expect(html).toContain('name="dg-print-mode" content="labels"');
    expect(html).toContain('dg-a4-page');
    expect(html).toContain('grid-template-columns:repeat(5, 38mm)');
    expect((html.match(/class="dg-label-cell"/g) || []).length).toBe(6);
    expect(html).toContain('label-sheet');
  });

  it('renderLabelsPrintHtml thermal mode sets @page to template dimensions', async () => {
    const template = textOnlyTemplate();
    const html = await renderLabelsPrintHtml(template, [SAMPLE_LABEL_CONTEXT], 'thermal');

    expect(html).toContain('@page { size: 38mm 25mm; margin: 0; }');
    expect(html).toContain('thermal-page');
    expect(html).not.toContain('dg-a4-page');
  });

  it('withPrintPagination skips generic A4 @page when dg-print-mode=labels', () => {
    const labelHtml =
      '<!DOCTYPE html><html><head><meta name="dg-print-mode" content="labels" /></head><body></body></html>';
    const out = withPrintPagination(labelHtml);

    expect(out).not.toMatch(/@page\s*\{\s*margin:\s*8mm;\s*size:\s*A4/);
    expect(out).toContain('.dg-label-cell');
    expect(out).toContain('.dg-a4-page');
  });

  it('withPrintPagination injects generic A4 @page for non-label HTML', () => {
    const billHtml = '<!DOCTYPE html><html><head></head><body><table></table></body></html>';
    const out = withPrintPagination(billHtml);

    expect(out).toMatch(/@page\s*\{\s*margin:\s*8mm;\s*size:\s*A4/);
    expect(out).not.toContain('.dg-a4-page');
  });
});
