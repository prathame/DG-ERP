/**
 * LIFO stack for Android hardware back / Cap backButton.
 * Newest handler runs first; return true if the press was consumed (overlay/detail closed).
 */

export type AndroidBackHandler = () => boolean;

const handlers: AndroidBackHandler[] = [];

export function pushAndroidBackHandler(handler: AndroidBackHandler): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Run newest → oldest; stop at first handler that returns true. */
export function consumeAndroidBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      if (handlers[i]()) return true;
    } catch {
      /* ignore broken handler */
    }
  }
  return false;
}

/** @internal vitest */
export function __resetAndroidBackHandlersForTests(): void {
  handlers.length = 0;
}

/** @internal vitest */
export function __androidBackHandlerCountForTests(): number {
  return handlers.length;
}
