import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
const gradlePath = join(root, 'android/app/build.gradle');
const stringsPath = join(root, 'android/app/src/main/res/values/strings.xml');

function setProduct(product: 'offline' | 'online') {
  execFileSync('bash', ['scripts/android-set-product.sh', product], { cwd: root });
}

describe('android-set-product.sh', () => {
  afterAll(() => {
    setProduct('offline');
  });

  it('rewrites applicationId for Online then Offline (Cap sync does not)', () => {
    setProduct('online');
    expect(readFileSync(gradlePath, 'utf8')).toContain('applicationId "in.dhandho.servicecloud"');
    expect(readFileSync(stringsPath, 'utf8')).toContain('<string name="package_name">in.dhandho.servicecloud</string>');

    setProduct('offline');
    expect(readFileSync(gradlePath, 'utf8')).toContain('applicationId "in.dhandho.service"');
    expect(readFileSync(stringsPath, 'utf8')).toContain('<string name="package_name">in.dhandho.service</string>');
  });
});
