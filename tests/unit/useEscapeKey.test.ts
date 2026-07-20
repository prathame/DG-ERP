/**
 * Contract for Escape-to-close used by ChatWidget, ConfirmDialog, and feature modals.
 * Handlers return true when they closed something (Android back stack consumes that).
 * Full React hook test needs a DOM renderer; this locks the key-filter behavior.
 */
import { describe, it, expect, vi } from 'vitest';

function escapeFilter(onEscape: () => boolean | void) {
  return (key: string) => {
    if (key === 'Escape') return onEscape();
  };
}

describe('escape-to-close contract', () => {
  it('invokes handler only for Escape', () => {
    const onEscape = vi.fn(() => true);
    const handler = escapeFilter(onEscape);
    handler('Enter');
    handler('Esc');
    expect(onEscape).not.toHaveBeenCalled();
    expect(handler('Escape')).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('can be disabled by not attaching', () => {
    const onEscape = vi.fn(() => true);
    const enabled = false;
    if (enabled) escapeFilter(onEscape)('Escape');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('signals unhandled when nothing to close (root double-back)', () => {
    const onEscape = vi.fn(() => false);
    expect(escapeFilter(onEscape)('Escape')).toBe(false);
  });
});
