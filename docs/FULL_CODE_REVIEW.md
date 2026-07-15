# Dhandho — code review (v3)

**Baseline:** current disk (P0 fixes uncommitted) · **Date:** 2026-07-15  
**Open:** 18 findings — 1 critical · 7 high · 9 medium · 1 low  
**E2E:** `e2e_by_type` 493/493

## Closed this session (P0)

| ID | Fix |
|----|-----|
| C1 | Deleted-user JWT → 401 |
| C2 / H13 | `requireAdmin` on backup export + settings write |
| C3 | Distribution no premature `client.release()` |
| H5 | Product create `ROLLBACK` before early return |
| H3 | Restore clears only allowlisted tables |
| H4 | `deleteTenant` dropped nonexistent `transactions` |

---

## Open findings

### Critical / High

| ID | Sev | Location | Finding |
|----|-----|----------|---------|
| H1 | critical | vendors / finance / distribution / sales GET | **Vendor horizontal IDOR** — only `GET /api/sales` scopes JWT `vendorId` |
| H2 | high | server + `App.tsx` | **Module permissions UI-only**; tab content not gated by `canAccess` |
| H6 | high | invoice-finance / replacements / accounts notes | **Missing `blockVendors`** |
| H8 | high | `accounts.ts` P&L | **Double-counts distribution + sales revenue** |
| H9 | high | `quotations.ts` convert | **TOCTOU stock race** (no `FOR UPDATE`) |
| H10 | high | print views + `utils.ts` | **Print/PDF XSS** outside `billTemplates` |
| H11 | high | LoginScreen + App mobile/menu | **Login drops permissions**; nav/Settings bypasses |
| H12 | high | Electron onprem | **Hardcoded PG password**; wizard IPC on main preload; **stale `main.js` still has executeJavaScript** |

### Medium

| ID | Location | Finding |
|----|----------|---------|
| H7 | invoice-finance / finance | Invoice overpay; payment response invents new ID |
| M1 | `requireRole` | Trusts JWT role, not live DB role |
| M2 | login | Slug optional → cross-tenant email collision |
| M3 | `planLimits` | Fail-open on DB error |
| M4 | RLS | Advisory only (no FORCE) |
| M5 | onprem deactivate | Unrate-limited |
| M6 | distribution | Delete orphans payments; apply-billing non-txn |
| M7 | Electron | `openExternal` no allowlist; weak license crypto; CLOUD_URL drift |
| M8 | rewards / day-book | Ledger drift; vendor payment sign flip |

### Low

| ID | Finding |
|----|---------|
| L1 | Tokens in `localStorage` (XSS → session theft) |

---

## Recommended next

1. Central vendor-scope helper on all Vendor-visible GETs (**H1**)
2. `blockVendors` on invoice-finance / replacements / notes (**H6**)
3. Reuse `billTemplates` `esc()` on all print paths + PDF title (**H10**)
4. Rebuild `electron/onprem/main.js` from TS (**H12**)
5. Fix P&L double-count; quotation convert locking (**H8/H9**)

## Solid

HS256 JWT, deleted-user reject, platform-token isolation, backup Admin+allowlist, sales `FOR UPDATE`, distribution `SKIP LOCKED`, `billTemplates` escaping, `contextIsolation`, CORS allowlist.
