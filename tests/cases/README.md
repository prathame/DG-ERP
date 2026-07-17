# Test Cases — Index

Complete test case suite for the Splendor ERP application. Each file covers a specific module or cross-cutting concern.

| # | File | Module | Test Cases | Priority |
|---|------|--------|------------|----------|
| 1 | [landing-page.md](landing-page.md) | Landing Page | 13 | Medium |
| 2 | [super-admin.md](super-admin.md) | Super Admin Panel | 44 | High |
| 3 | [auth-login.md](auth-login.md) | Authentication & Login | 15 | Critical |
| 4 | [inventory.md](inventory.md) | Inventory Management | 17 | Critical |
| 5 | [verification.md](verification.md) | Product Verification | 17 | High |
| 6 | [sales.md](sales.md) | Sales | 15 | Critical |
| 7 | [distribution.md](distribution.md) | Distribution | 9 | High |
| 8 | [vendors.md](vendors.md) | Vendor Management | 8 | High |
| 9 | [finance.md](finance.md) | Finance | 6 | High |
| 10 | [bill-customization.md](bill-customization.md) | Bill Customization | 12 | Medium |
| 11 | [settings.md](settings.md) | Settings | 11 | Medium |
| 12 | [security.md](security.md) | Security | 15 | Critical |
| 13 | [multi-language.md](multi-language.md) | Multi-Language | 6 | Medium |
| 14 | [chatbot.md](chatbot.md) | Chatbot | 7 | Low |
| 15 | [cross-tenant.md](cross-tenant.md) | Cross-Tenant Isolation | 7 | Critical |
| 16 | [edge-cases.md](edge-cases.md) | Edge Cases | 10 | Medium |
| 17 | [service-mobile.md](service-mobile.md) | Service Mobile (offline phone) | 12 | Critical |
| 18 | [service-cloud.md](service-cloud.md) | Service Cloud Seats (online) | 16 | Critical |
| 19 | [cloud-mobile.md](cloud-mobile.md) | Cloud mobile UX (phones) | 12 | High |

---

**Total:** see each file for exact counts. Service Mobile = offline Capacitor (`DG-SM`). Service Cloud Seats = online seats on a service cloud tenant. Cloud mobile = phone usability for the cloud web/SA app (desktop unchanged).

**Product docs:** [`DEVELOPER.md`](../../DEVELOPER.md) · [`README.md`](../../README.md)

### Priority Legend

| Priority | Meaning |
|----------|---------|
| Critical | Must pass before any release; blocks deployment |
| High | Should pass; major functionality impacted if failing |
| Medium | Important but not release-blocking |
| Low | Nice to have; cosmetic or secondary features |
