import { describe, it, expect } from 'vitest';
import {
  validateBarcodeValue,
  validateLabelTemplateInput,
  resolveDynamicField,
  defaultStarterTemplate,
  SAMPLE_LABEL_CONTEXT,
  validateEan13Checksum,
} from '../../shared/barcodeLabelTemplate';

describe('barcode label template validation', () => {
  it('validates EAN-13 checksum', () => {
    expect(validateEan13Checksum('8901234567890')).toBe(true);
    expect(validateEan13Checksum('8901234567891')).toBe(false);
  });

  it('rejects invalid EAN-13 barcode values', () => {
    expect(validateBarcodeValue('EAN13', '123')).toMatch(/13 digits/);
    expect(validateBarcodeValue('EAN13', '8901234567890')).toBeNull();
  });

  it('validates template dimensions', () => {
    const starter = defaultStarterTemplate();
    expect(
      validateLabelTemplateInput({
        name: 'Test',
        widthMm: starter.widthMm,
        heightMm: starter.heightMm,
        elements: starter.elements,
      }),
    ).toBeNull();
    expect(validateLabelTemplateInput({ name: '', widthMm: 38, heightMm: 25, elements: [] })).toMatch(/name/i);
    expect(validateLabelTemplateInput({ name: 'X', widthMm: 0, heightMm: 25, elements: [] })).toMatch(/Width/);
  });

  it('resolves dynamic product fields', () => {
    expect(resolveDynamicField('product.name', SAMPLE_LABEL_CONTEXT)).toBe('DG-Product-Alpha');
    expect(resolveDynamicField('product.price', SAMPLE_LABEL_CONTEXT)).toContain('999');
  });
});
