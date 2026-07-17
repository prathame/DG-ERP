# Service Mobile — Manual / E2E Cases

Offline Capacitor phone app for **service** business type. SA keys `DG-SM-…`. Local PGlite is source of truth.

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Issue license | SA → Tenants → Service Mobile → Issue | Key starts with `DG-SM-`, business type service, max users 1 |
| 2 | Activate first device | Enter key on phone (online) | Activates; device bound; last-seen updates |
| 3 | Second device blocked | Activate same key on another phone | Rejected until SA Unbind |
| 4 | Local provision | Set admin password ≥8 chars | Login works offline; only one user |
| 5 | Offline ERP | Airplane mode → create client + invoice | Persists locally; no cloud ERP calls |
| 6 | Hard sync settings | SA push tab/settings → phone Sync / wait heartbeat | Settings applied; force sync reloads UI |
| 7 | SA Bell | SA notify on license → phone online | Message appears in in-app Bell |
| 8 | Backup upload | Phone online after data entry | SA shows latest backup timestamp |
| 9 | Phone lost restore | SA Unbind → new phone activate → Restore backup | Same company data; wrong license cannot restore |
| 10 | Unbound backup blocked | Unbind then try backup upload without activate | 403 Device mismatch |
| 11 | Sideload / TestFlight | Install APK or TestFlight build | App opens; onboarding works |
| 12 | Download page | Open `/download` | Service Mobile section present |

**Automated:** `tests/api/http-service-mobile.test.ts` (license lifecycle + backup scoping).
