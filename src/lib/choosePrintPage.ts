import type { BillPrintPage } from './billTemplates';

/** Short bills fit A5; denser bills stay A4. */
export const HALF_PAGE_ITEM_LIMIT = 8;

export function suggestedPrintPage(itemCount: number): BillPrintPage {
  return itemCount > 0 && itemCount <= HALF_PAGE_ITEM_LIMIT ? 'half' : 'full';
}

/**
 * Ask Full page vs Half page before print. Cancel returns null.
 * Suggested size is highlighted when there are few line items.
 */
export function choosePrintPage(itemCount = 0): Promise<BillPrintPage | null> {
  if (typeof document === 'undefined') {
    return Promise.resolve(suggestedPrintPage(itemCount));
  }
  const suggested = suggestedPrintPage(itemCount);
  return new Promise(resolve => {
    const existing = document.getElementById('dg-print-page-pick');
    existing?.remove();

    const root = document.createElement('div');
    root.id = 'dg-print-page-pick';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Print size');
    root.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:16px;';

    const card = document.createElement('div');
    card.style.cssText =
      'background:#fff;border-radius:16px;padding:20px;max-width:22rem;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.2);font-family:system-ui,sans-serif;';
    card.innerHTML = `
      <p style="font-weight:700;font-size:16px;margin:0 0 4px;color:#111;">Print size</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px;line-height:1.4;">${
        suggested === 'half'
          ? 'Few items — half page usually fits. You can still print full page.'
          : 'Full page (A4) or half page (A5) receipt.'
      }</p>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <button type="button" data-page="full" style="flex:1;min-height:44px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;border:1px solid ${
          suggested === 'full' ? '#ea580c' : '#e5e7eb'
        };background:${suggested === 'full' ? '#ea580c' : '#fff'};color:${suggested === 'full' ? '#fff' : '#374151'};">Full page</button>
        <button type="button" data-page="half" style="flex:1;min-height:44px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;border:1px solid ${
          suggested === 'half' ? '#ea580c' : '#e5e7eb'
        };background:${suggested === 'half' ? '#ea580c' : '#fff'};color:${suggested === 'half' ? '#fff' : '#374151'};">Half page</button>
      </div>
      <button type="button" data-cancel="1" style="width:100%;min-height:40px;border:none;background:transparent;color:#6b7280;font-weight:600;cursor:pointer;">Cancel</button>
    `;
    root.appendChild(card);
    document.body.appendChild(root);

    const done = (page: BillPrintPage | null) => {
      window.removeEventListener('keydown', onKey);
      root.remove();
      resolve(page);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(null);
      }
    };
    window.addEventListener('keydown', onKey);
    root.addEventListener('click', e => {
      if (e.target === root) done(null);
    });
    card.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLButtonElement;
        if (el.dataset.cancel) done(null);
        else if (el.dataset.page === 'half' || el.dataset.page === 'full') done(el.dataset.page);
      });
    });
  });
}
