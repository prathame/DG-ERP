# Dhandho — full code review (v5)

**Baseline:** fixes on top of `main` @ `46ccf0d`  
**Date:** 2026-07-15  
**Open:** 3 findings deferred — 0 critical · 0 high · 2 medium · 1 low

---

## Closed in this pass (verified then fixed)

| ID | Fix |
|----|-----|
| C1 | Vendor finance detail `assertVendorAccess`; reminders `blockVendors`; parameterized vendor filter |
| C2 | Distribution batches forced to JWT vendor scope; delete also clears `vendor_payments` |
| C3 | Rewards list scoped; products GET limited to distributed products for Vendors |
| H1 | Auth middleware re-reads live `role` / `vendor_id` from DB |
| H2 | Login persists `permissions`; App gates tabs/nav/Settings/Cmd+K by `canAccess` |
| H3 | Print XSS: invoices, vendor finance, verification, price list, barcode labels, accounts print clone |
| H4 | `tsc:electron` rebuild; random PG password on first run + credentials file; complete-setup refuses if licensed |
| H5 | Invoice payment rejects overpay |
| H6 | `openExternal` http/https only |
| M1 | Finance vendor filter parameterized |
| M2 | Login without slug rejects ambiguous multi-tenant email |
| M3 | Plan limits fail-closed |
| M5 | Batch delete orphans payments; apply-billing in transaction |
| M6 | Rewards earned bumps vendor counter (day-book cash vs sales conflation left as accounting design) |
| M7 | CLOUD_URL `.js` synced via `tsc:electron` (weak license key unchanged — needs product decision) |
| M8 | Products 500 no longer returns raw `errStr` |
| L2 | Audit log `requireAdmin` |

## Still deferred

| ID | Why |
|----|-----|
| M4 | FORCE RLS needs `withTenantClient` everywhere — large cutover |
| M7 partial | Weak on-prem license key format — product/crypto decision |
| L1 | Move tokens to httpOnly cookies — frontend+auth architecture |

## Prior closed (already on main)

Deleted-user JWT · Backup `requireAdmin` · Distribution double-release · Product create `ROLLBACK` · Restore allowlist-only clear · `deleteTenant` no `transactions` · Forgot-password no token · Platform JWT isolation · P&L OWNER filter · Quotation `FOR UPDATE` · `blockVendors` on invoice-finance / replacements / notes

## Solid

HS256 JWT, deleted-user reject, platform-token isolation, backup Admin+allowlist, sales `FOR UPDATE`, distribution `SKIP LOCKED`, quotation convert lock, `billTemplates` escaping, `contextIsolation`, CORS allowlist, live role revalidation, vendor scope helpers.
