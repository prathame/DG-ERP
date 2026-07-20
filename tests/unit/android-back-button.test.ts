import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushAndroidBackHandler,
  consumeAndroidBack,
  __resetAndroidBackHandlersForTests,
  __androidBackHandlerCountForTests,
} from '../../src/lib/androidBackStack';
import { shouldExitOnRootBack } from '../../src/lib/androidBackButton';

describe('androidBackStack', () => {
  beforeEach(() => {
    __resetAndroidBackHandlersForTests();
  });

  it('runs newest handler first and stops when consumed', () => {
    const order: string[] = [];
    pushAndroidBackHandler(() => {
      order.push('old');
      return false;
    });
    pushAndroidBackHandler(() => {
      order.push('new');
      return true;
    });
    expect(consumeAndroidBack()).toBe(true);
    expect(order).toEqual(['new']);
  });

  it('falls through when handlers return false', () => {
    pushAndroidBackHandler(() => false);
    pushAndroidBackHandler(() => false);
    expect(consumeAndroidBack()).toBe(false);
  });

  it('unregister removes handler', () => {
    const off = pushAndroidBackHandler(() => true);
    expect(__androidBackHandlerCountForTests()).toBe(1);
    off();
    expect(__androidBackHandlerCountForTests()).toBe(0);
    expect(consumeAndroidBack()).toBe(false);
  });
});

describe('shouldExitOnRootBack', () => {
  it('requires a prior press within the window', () => {
    expect(shouldExitOnRootBack(2000, 0, 2000)).toBe(false);
    expect(shouldExitOnRootBack(2000, 500, 2000)).toBe(true);
    expect(shouldExitOnRootBack(3000, 500, 2000)).toBe(false);
  });
});
