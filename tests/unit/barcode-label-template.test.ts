import { describe, it, expect } from 'vitest';
import {
  validateBarcodeValue,
  validateLabelTemplateInput,
  resolveDynamicField,
  resolveElementText,
  resolveBarcodeValue,
  normalizeLabelElement,
  defaultStarterTemplate,
  SAMPLE_LABEL_CONTEXT,
  validateEan13Checksum,
  jsBarcodeFormat,
  roundMm,
  clampMm,
  MAX_ELEMENTS,
  MAX_LABEL_HEIGHT_MM,
  MAX_LABEL_WIDTH_MM,
  LABEL_SAMPLE_TEMPLATES,
  getLabelSampleTemplate,
  type LabelElement,
} from '../../shared/barcodeLabelTemplate';

describe('barcode label template validation', () => {
  it('validates EAN-13 checksum', () => {
    expect(validateEan13Checksum('8901234567890')).toBe(true);
    expect(validateEan13Checksum('8901234567891')).toBe(false);
  });

  it('validates barcode values by symbology', () => {
    expect(validateBarcodeValue('EAN13', '123')).toMatch(/13 digits/);
    expect(validateBarcodeValue('EAN13', '8901234567890')).toBeNull();
    expect(validateBarcodeValue('EAN8', '1234567')).toMatch(/8 digits/);
    expect(validateBarcodeValue('EAN8', '12345678')).toBeNull();
    expect(validateBarcodeValue('UPC', '123')).toMatch(/12 digits/);
    expect(validateBarcodeValue('UPCE', '123456')).toBeNull();
    expect(validateBarcodeValue('CODE39', 'HELLO-WORLD')).toBeNull();
    expect(validateBarcodeValue('CODE39', 'hello')).toMatch(/invalid characters/i);
    expect(validateBarcodeValue('CODE128', '')).toMatch(/required/i);
    expect(validateBarcodeValue('CODE128', 'A'.repeat(81))).toMatch(/too long/i);
  });

  it('maps symbology to JsBarcode format names', () => {
    expect(jsBarcodeFormat('EAN13')).toBe('EAN13');
    expect(jsBarcodeFormat('UPC')).toBe('UPC');
    expect(jsBarcodeFormat('CODE128')).toBe('CODE128');
  });

  it('rounds and clamps millimeter values', () => {
    expect(roundMm(12.3456)).toBe(12.35);
    expect(clampMm(-5)).toBe(0);
    expect(clampMm(999)).toBe(MAX_LABEL_WIDTH_MM);
    expect(clampMm(50, 10, MAX_LABEL_HEIGHT_MM)).toBe(50);
  });

  it('validates template dimensions and name', () => {
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
    expect(validateLabelTemplateInput({ name: 'X', widthMm: 38, heightMm: 0, elements: [] })).toMatch(/Height/);
    expect(
      validateLabelTemplateInput({ name: 'X', widthMm: MAX_LABEL_WIDTH_MM + 1, heightMm: 25, elements: [] }),
    ).toMatch(/Width/);
    expect(
      validateLabelTemplateInput({ name: 'X', widthMm: 38, heightMm: MAX_LABEL_HEIGHT_MM + 1, elements: [] }),
    ).toMatch(/Height/);
  });

  it('rejects invalid elements and custom barcode values', () => {
    expect(
      validateLabelTemplateInput({
        name: 'Bad',
        widthMm: 38,
        heightMm: 25,
        elements: [{ type: 'unknown', xMm: 0, yMm: 0, widthMm: 10, heightMm: 5 }],
      }),
    ).toMatch(/Invalid element/);
    expect(
      validateLabelTemplateInput({
        name: 'Bad barcode',
        widthMm: 38,
        heightMm: 25,
        elements: [
          {
            id: 'b1',
            type: 'barcode',
            xMm: 1,
            yMm: 1,
            widthMm: 30,
            heightMm: 10,
            rotation: 0,
            zIndex: 0,
            visible: true,
            properties: { barcodeType: 'EAN13', barcodeValueSource: 'custom', customBarcodeValue: '123' },
          },
        ],
      }),
    ).toMatch(/13 digits/);
    const tooMany = Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => ({
      id: `el-${i}`,
      type: 'text' as const,
      xMm: 0,
      yMm: 0,
      widthMm: 10,
      heightMm: 5,
      rotation: 0,
      zIndex: i,
      visible: true,
      properties: { staticText: 'x' },
    }));
    expect(validateLabelTemplateInput({ name: 'Many', widthMm: 38, heightMm: 25, elements: tooMany })).toMatch(
      /Maximum/,
    );
  });

  it('normalizes element position and dimensions', () => {
    const el = normalizeLabelElement(
      {
        id: 'x',
        type: 'text',
        xMm: -5,
        yMm: 500,
        widthMm: 0.1,
        heightMm: 999,
        properties: { staticText: 'Hi' },
      },
      2,
    );
    expect(el).toBeTruthy();
    expect(el!.xMm).toBe(0);
    expect(el!.yMm).toBe(MAX_LABEL_HEIGHT_MM);
    expect(el!.widthMm).toBe(0.5);
    expect(el!.heightMm).toBe(MAX_LABEL_HEIGHT_MM);
    expect(el!.zIndex).toBe(2);
    expect(normalizeLabelElement({ type: 'bogus' }, 0)).toBeNull();
  });

  it('resolves dynamic product and company fields', () => {
    expect(resolveDynamicField('product.name', SAMPLE_LABEL_CONTEXT)).toBe('DG-Product-Alpha');
    expect(resolveDynamicField('product.price', SAMPLE_LABEL_CONTEXT)).toContain('999');
    expect(resolveDynamicField('product.hsn', SAMPLE_LABEL_CONTEXT)).toBe('8471');
    expect(resolveDynamicField('product.gstRate', SAMPLE_LABEL_CONTEXT)).toBe('18%');
    expect(resolveDynamicField('company.gstin', SAMPLE_LABEL_CONTEXT)).toBe('24AABCU9603R1ZM');
  });

  it('resolves static and dynamic element text', () => {
    const staticEl: LabelElement = {
      id: 't1',
      type: 'text',
      xMm: 0,
      yMm: 0,
      widthMm: 20,
      heightMm: 5,
      rotation: 0,
      zIndex: 0,
      visible: true,
      properties: { staticText: 'MRP', prefix: ' ', suffix: ':' },
    };
    const fieldEl: LabelElement = {
      ...staticEl,
      id: 't2',
      type: 'field',
      properties: { fieldKey: 'product.name', prefix: 'Name: ' },
    };
    expect(resolveElementText(staticEl, SAMPLE_LABEL_CONTEXT)).toBe(' MRP:');
    expect(resolveElementText(fieldEl, SAMPLE_LABEL_CONTEXT)).toBe('Name: DG-Product-Alpha');
  });

  it('resolves barcode value from product or custom source', () => {
    const dynamic: LabelElement = {
      id: 'b1',
      type: 'barcode',
      xMm: 0,
      yMm: 0,
      widthMm: 30,
      heightMm: 10,
      rotation: 0,
      zIndex: 0,
      visible: true,
      properties: { barcodeValueSource: 'product.barcode' },
    };
    const custom: LabelElement = {
      ...dynamic,
      properties: { barcodeValueSource: 'custom', customBarcodeValue: ' 123456789012 ' },
    };
    expect(resolveBarcodeValue(dynamic, SAMPLE_LABEL_CONTEXT)).toBe('8901234567890');
    expect(resolveBarcodeValue(custom, SAMPLE_LABEL_CONTEXT)).toBe('123456789012');
  });

  it('default starter template includes expected elements', () => {
    const starter = defaultStarterTemplate('My Label');
    expect(starter.name).toBe('My Label');
    expect(starter.widthMm).toBe(38);
    expect(starter.elements.length).toBeGreaterThanOrEqual(5);
    expect(starter.elements.some(el => el.type === 'barcode')).toBe(true);
    expect(starter.elements.some(el => el.type === 'logo')).toBe(true);
    expect(validateLabelTemplateInput(starter)).toBeNull();
  });

  it('exposes built-in sample templates', () => {
    expect(LABEL_SAMPLE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(getLabelSampleTemplate('product-38x25')?.name).toMatch(/38/);
    for (const sample of LABEL_SAMPLE_TEMPLATES) {
      expect(validateLabelTemplateInput(sample.template)).toBeNull();
    }
  });
});
