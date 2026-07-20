import { describe, expect, it } from 'vitest';
import { notificationIdToInt, shouldMirrorToOs } from '../../src/lib/capLocalNotifications';

describe('capLocalNotifications helpers', () => {
  it('maps string ids to stable positive int notification ids', () => {
    const a = notificationIdToInt('admin_message:abc');
    const b = notificationIdToInt('admin_message:abc');
    const c = notificationIdToInt('quote_expiring:2026-07-20');
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(2147483647);
    expect(c).not.toBe(a);
  });

  it('mirrors high priority always; medium only when not visible', () => {
    expect(shouldMirrorToOs({ priority: 'high', visibilityState: 'visible' })).toBe(true);
    expect(shouldMirrorToOs({ priority: 'high', visibilityState: 'hidden' })).toBe(true);
    expect(shouldMirrorToOs({ priority: 'medium', visibilityState: 'visible' })).toBe(false);
    expect(shouldMirrorToOs({ priority: 'medium', visibilityState: 'hidden' })).toBe(true);
  });
});
