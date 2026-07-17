---
sidebar_label: Platforms
title: Platforms (Web + Electron + Service Mobile)
description: src/platforms/ — shared API base, Electron desktop helpers, and Service Mobile offline phone runtime.
---

# Platforms — `src/platforms/`

```mermaid
graph TD
    subgraph "src/platforms/"
        Shared[shared/apiBase.ts<br/>URL resolution]
        subgraph "desktop/"
            DOnline[online/ — Electron cloud marker]
            DOffline[offline/ — OnlineStatus UI]
        end
        SM[service-mobile/<br/>Capacitor offline service]
    end
    App[App.tsx] --> Shared
    App --> DOffline
    App --> SM
```

| Path | Runtime | Notes |
|------|---------|--------|
| `shared/` | Web + Electron | `resolveApiUrl` / optional `VITE_API_ORIGIN` |
| `desktop/online/` | Electron cloud | Thin wrapper around hosted app |
| `desktop/offline/` | Electron on-prem | `OnlineStatus` for license sync |
| `service-mobile/` | Capacitor phone | Offline PGlite + SA `DG-SM-` licenses; service type only |

Native Electron processes live under repo-root `electron/` — see [Deployment → Electron](/deployment/electron).  
Service Mobile packaging — see [Deployment → Service Mobile](/deployment/service-mobile).

## Related

- [Product Surfaces](/architecture/four-surfaces)
- [On-Prem API](/api/mobile-onprem)
- [Service Mobile API](/api/service-mobile)
