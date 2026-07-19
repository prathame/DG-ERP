import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Capacitor-managed SPM must stay in sync with Android Cap plugins after `cap sync ios`. */
describe('service-mobile iOS CapApp-SPM', () => {
  const pkg = readFileSync(resolve(process.cwd(), 'ios/App/CapApp-SPM/Package.swift'), 'utf8');

  it('declares the same Capacitor plugins as Offline Android', () => {
    for (const name of [
      'CapacitorApp',
      'CapacitorFilesystem',
      'CapacitorPreferences',
      'CapacitorShare',
      'CapgoCapacitorPrinter',
    ]) {
      expect(pkg, `missing SPM package ${name}`).toContain(name);
    }
  });

  it('targets iOS 15+', () => {
    expect(pkg).toMatch(/\.iOS\(\.v15\)/);
  });
});
