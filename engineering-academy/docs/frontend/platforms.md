---
sidebar_label: Platforms
title: Platforms (Web + Electron)
description: src/platforms/ — shared API base resolution and desktop Electron helpers. Capacitor mobile has been removed.
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
    end
    App[App.tsx] --> Shared
    App --> DOffline
```

| Path | Runtime | Notes |
|------|---------|--------|
| `shared/` | Web + Electron | `resolveApiUrl` / optional `VITE_API_ORIGIN` |
| `desktop/online/` | Electron cloud | Thin wrapper around hosted app |
| `desktop/offline/` | Electron on-prem | `OnlineStatus` for license sync |


Native Electron processes live under repo-root `electron/` — see [Deployment → Electron](/deployment/electron).

## Related

- [Product Surfaces](/architecture/four-surfaces)
- [On-Prem API](/api/mobile-onprem)
