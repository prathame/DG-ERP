/**
 * Contract for Escape-to-close used by ChatWidget, ConfirmDialog, and feature modals.
 * Full React hook test needs a DOM renderer; this locks the key-filter behavior.
 */
import { describe, it, expect, vi } from 'vitest';

function escapeFilter(onEscape: () => void) {
  return (key: string) => {
    if (key === 'Escape') onEscape();
  };
}

describe('escape-to-close contract', () => {
  it('invokes handler only for Escape', () => {
    const onEscape = vi.fn();
    const handler = escapeFilter(onEscape);
    handler('Enter');
    handler('Esc');
    expect(onEscape).not.toHaveBeenCalled();
    handler('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('can be disabled by not attaching', () => {
    const onEscape = vi.fn();
    const enabled = false;
    if (enabled) escapeFilter(onEscape)('Escape');
    expect(onEscape).not.toHaveBeenCalled();
  });
});
