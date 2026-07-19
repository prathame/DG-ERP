import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
const pbxPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const plistPath = join(root, 'ios/App/App/Info.plist');

function setProduct(product: 'offline' | 'online') {
  execFileSync('bash', ['scripts/ios-set-product.sh', product], { cwd: root });
}

describe('ios-set-product.sh', () => {
  afterAll(() => {
    setProduct('offline');
  });

  it('rewrites bundle id + display name for Online then Offline', () => {
    setProduct('online');
    expect(readFileSync(pbxPath, 'utf8')).toContain('PRODUCT_BUNDLE_IDENTIFIER = in.dhandho.servicecloud;');
    expect(readFileSync(plistPath, 'utf8')).toContain('<string>Dhandho Service Cloud</string>');

    setProduct('offline');
    expect(readFileSync(pbxPath, 'utf8')).toContain('PRODUCT_BUNDLE_IDENTIFIER = in.dhandho.service;');
    expect(readFileSync(plistPath, 'utf8')).toContain('<string>Dhandho Service</string>');
  });
});
